// src/services/index.js
// Layer 2: Application Logic / Services Layer
// All services use the real SQLite DB via expo-sqlite

import { getDB, generateId, hashPin, saveSession, clearSession } from '../db/database';
import { CategorizationEngine, AnomalyDetectionEngine, ForecastingEngine, RecommendationEngine, SubscriptionEngine } from '../engines';

// ─────────────────────────────────────────────
// Auth & Security Service
// ─────────────────────────────────────────────

export const AuthSecurityService = {
  async createProfile(name, email, pin) {
    const db = await getDB();
    const existing = await db.getFirstAsync('SELECT id FROM profiles WHERE email = ?', [email]);
    if (existing) return { error: 'Email already registered' };

    const id = generateId('profile');
    await db.runAsync(
      'INSERT INTO profiles (id, name, email, pin_hash, created_at, preferences) VALUES (?,?,?,?,?,?)',
      [id, name, email, hashPin(pin), new Date().toISOString(), JSON.stringify({ currency: 'USD', theme: 'dark' })]
    );

    const profile = await db.getFirstAsync('SELECT * FROM profiles WHERE id = ?', [id]);
    return { profile };
  },

  async login(email, pin) {
    const db = await getDB();
    const profile = await db.getFirstAsync('SELECT * FROM profiles WHERE email = ?', [email]);
    if (!profile) return { error: 'No account found' };
    if (profile.pin_hash !== hashPin(pin)) return { error: 'Incorrect PIN' };
    return { profile };
  },
};

// ─────────────────────────────────────────────
// Financial Data Service
// ─────────────────────────────────────────────

export const FinancialDataService = {
  async getTransactions(profileId, filters = {}) {
    const db = await getDB();
    let query = 'SELECT * FROM transactions WHERE profile_id = ?';
    const params = [profileId];

    if (filters.month) {
      query += ' AND date LIKE ?';
      params.push(`${filters.month}%`);
    }
    if (filters.category) {
      query += ' AND category_id = ?';
      params.push(filters.category);
    }
    if (filters.search) {
      query += ' AND (LOWER(merchant) LIKE ? OR LOWER(note) LIKE ?)';
      params.push(`%${filters.search.toLowerCase()}%`, `%${filters.search.toLowerCase()}%`);
    }

    query += ' ORDER BY date DESC';
    return db.getAllAsync(query, params);
  },

  async addTransaction(profileId, data) {
    const db = await getDB();
    const cats = await db.getAllAsync('SELECT * FROM categories');
    const category_id = data.category_id || CategorizationEngine.categorize(data.merchant, cats);
    const id = generateId('tx');

    await db.runAsync(
      'INSERT INTO transactions (id, profile_id, date, merchant, amount, category_id, note, source, hash, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [id, profileId, data.date, data.merchant, data.amount, category_id, data.note || '', data.source || 'manual', data.hash || null, new Date().toISOString()]
    );
    return db.getFirstAsync('SELECT * FROM transactions WHERE id = ?', [id]);
  },

  async updateTransaction(id, updates) {
    const db = await getDB();
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(updates), id];
    await db.runAsync(`UPDATE transactions SET ${fields} WHERE id = ?`, values);
    return db.getFirstAsync('SELECT * FROM transactions WHERE id = ?', [id]);
  },

  async deleteTransaction(id) {
    const db = await getDB();
    await db.runAsync('DELETE FROM transactions WHERE id = ?', [id]);
    return true;
  },

  async getMonthlySpendByCategory(profileId, month) {
    const db = await getDB();
    const rows = await db.getAllAsync(
      'SELECT category_id, SUM(amount) as total FROM transactions WHERE profile_id = ? AND date LIKE ? AND amount < 0 GROUP BY category_id',
      [profileId, `${month}%`]
    );
    const result = {};
    rows.forEach(r => { result[r.category_id] = Math.abs(r.total); });
    return result;
  },

  async getAllCategories() {
    const db = await getDB();
    return db.getAllAsync('SELECT * FROM categories');
  },
};

// ─────────────────────────────────────────────
// Import & Integration Service (CSV)
// ─────────────────────────────────────────────

export const ImportIntegrationService = {
  parseCSV(text) {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return { error: 'CSV must have headers and data rows' };
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, '').toLowerCase());
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].match(/(".*?"|[^,]+)/g) || lines[i].split(',');
      const row = {};
      headers.forEach((h, idx) => { row[h] = (vals[idx] || '').trim().replace(/"/g, ''); });
      rows.push(row);
    }
    return { headers, rows };
  },

  mapColumns(rows, mapping) {
    return rows.map(r => ({
      date:     r[mapping.date] || '',
      merchant: r[mapping.merchant] || '',
      amount:   parseFloat((r[mapping.amount] || '0').replace(/[$,]/g, '')),
      note:     r[mapping.note] || '',
    })).filter(r => r.date && !isNaN(r.amount));
  },

  generateHash(tx) {
    return Buffer.from(`${tx.date}|${tx.merchant}|${tx.amount}`).toString('base64');
  },

  async importTransactions(profileId, mappedRows) {
    const db = await getDB();
    const existing = await db.getAllAsync(
      'SELECT hash FROM transactions WHERE profile_id = ? AND hash IS NOT NULL',
      [profileId]
    );
    const existingHashes = new Set(existing.map(t => t.hash));
    const cats = await db.getAllAsync('SELECT * FROM categories');

    let imported = 0, duplicates = 0;
    for (const row of mappedRows) {
      const hash = this.generateHash(row);
      if (existingHashes.has(hash)) { duplicates++; continue; }
      const category_id = CategorizationEngine.categorize(row.merchant, cats);
      await db.runAsync(
        'INSERT INTO transactions (id, profile_id, date, merchant, amount, category_id, note, source, hash, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [generateId('tx'), profileId, row.date, row.merchant, row.amount, category_id, row.note || '', 'csv', hash, new Date().toISOString()]
      );
      imported++;
    }
    return { imported, duplicates };
  },
};

// ─────────────────────────────────────────────
// Budgeting & Goal Service
// ─────────────────────────────────────────────

export const BudgetingGoalService = {
  async getBudgets(profileId) {
    const db = await getDB();
    return db.getAllAsync('SELECT * FROM budgets WHERE profile_id = ?', [profileId]);
  },

  async setBudget(profileId, categoryId, month, year, limitAmount) {
    const db = await getDB();
    await db.runAsync(
      `INSERT INTO budgets (id, profile_id, category_id, month, year, limit_amount, created_at)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(profile_id, category_id, month, year) DO UPDATE SET limit_amount = excluded.limit_amount`,
      [generateId('budget'), profileId, categoryId, month, year, limitAmount, new Date().toISOString()]
    );
  },

  async deleteBudget(id) {
    const db = await getDB();
    await db.runAsync('DELETE FROM budgets WHERE id = ?', [id]);
  },

  async getBudgetProgress(profileId, month) {
    const year = month.split('-')[0];
    const mon  = month.split('-')[1];
    const db   = await getDB();

    const budgets = await db.getAllAsync(
      'SELECT * FROM budgets WHERE profile_id = ? AND month = ? AND year = ?',
      [profileId, mon, year]
    );
    const spend = await FinancialDataService.getMonthlySpendByCategory(profileId, month);

    return budgets.map(b => ({
      ...b,
      spent:    spend[b.category_id] || 0,
      progress: (spend[b.category_id] || 0) / b.limit_amount,
    }));
  },
};

// ─────────────────────────────────────────────
// Reporting & Analytics Service
// Orchestrates AI/agent engines
// ─────────────────────────────────────────────

export const ReportingAnalyticsService = {
  async getDashboardData(profileId) {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastMonth = (() => {
      const d = new Date(now); d.setMonth(d.getMonth() - 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    })();

    const db = await getDB();
    const [allTx, cats, budgets] = await Promise.all([
      db.getAllAsync('SELECT * FROM transactions WHERE profile_id = ?', [profileId]),
      db.getAllAsync('SELECT * FROM categories'),
      BudgetingGoalService.getBudgetProgress(profileId, thisMonth),
    ]);

    const thisMonthTx  = allTx.filter(t => (t.date || '').startsWith(thisMonth));
    const lastMonthTx  = allTx.filter(t => (t.date || '').startsWith(lastMonth));
    const totalSpend   = thisMonthTx.filter(t => parseFloat(t.amount) < 0).reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0);
    const lastMonthSpend = lastMonthTx.filter(t => parseFloat(t.amount) < 0).reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0);
    const totalIncome  = thisMonthTx.filter(t => parseFloat(t.amount) > 0).reduce((s, t) => s + parseFloat(t.amount), 0);

    const spendByCategory = {};
    thisMonthTx.filter(t => parseFloat(t.amount) < 0).forEach(t => {
      spendByCategory[t.category_id] = (spendByCategory[t.category_id] || 0) + Math.abs(parseFloat(t.amount));
    });

    const recommendations = RecommendationEngine.generate(allTx, budgets, cats);
    const anomalies       = AnomalyDetectionEngine.detect(allTx, profileId);
    const subscriptions   = SubscriptionEngine.detect(allTx);
    const forecasts       = cats.filter(c => c.id !== 'cat_income').map(cat => ({
      category: cat,
      forecast: ForecastingEngine.forecast(allTx, cat.id),
    })).filter(f => f.forecast);

    return { totalSpend, lastMonthSpend, totalIncome, spendByCategory, cats, budgets, recommendations, anomalies, subscriptions, forecasts };
  },
};

// ─────────────────────────────────────────────
// Demo Data Seeder
// ─────────────────────────────────────────────

export async function seedDemoData(profileId) {
  const db = await getDB();
  const existing = await db.getFirstAsync(
    'SELECT COUNT(*) as c FROM transactions WHERE profile_id = ?', [profileId]
  );
  if (existing.c > 0) return;

  const merchants = [
    { name: 'Starbucks Coffee',       cat: 'cat_food',          amt: -6.75  },
    { name: 'Whole Foods Market',     cat: 'cat_food',          amt: -87.32 },
    { name: 'DoorDash',               cat: 'cat_food',          amt: -24.50 },
    { name: "McDonald's",             cat: 'cat_food',          amt: -11.20 },
    { name: 'Chipotle',               cat: 'cat_food',          amt: -13.85 },
    { name: 'Uber',                   cat: 'cat_transport',     amt: -18.40 },
    { name: 'Shell Gas Station',      cat: 'cat_transport',     amt: -62.00 },
    { name: 'Amazon',                 cat: 'cat_shopping',      amt: -143.99},
    { name: 'Target',                 cat: 'cat_shopping',      amt: -56.23 },
    { name: 'Netflix',                cat: 'cat_entertainment', amt: -15.99 },
    { name: 'Spotify',                cat: 'cat_entertainment', amt: -9.99  },
    { name: 'CVS Pharmacy',           cat: 'cat_health',        amt: -28.45 },
    { name: 'Rent Payment',           cat: 'cat_rent',          amt: -1450.00},
    { name: 'SCE Electric',           cat: 'cat_utilities',     amt: -94.00 },
    { name: 'Direct Deposit Payroll', cat: 'cat_income',        amt: 3500.00},
    { name: 'Uber Eats',              cat: 'cat_food',          amt: -31.20 },
    { name: 'Costco',                 cat: 'cat_shopping',      amt: -187.65},
    { name: 'Disney+',                cat: 'cat_entertainment', amt: -13.99 },
  ];

  const now = new Date();
  for (let dayOffset = 0; dayOffset < 35; dayOffset++) {
    const d = new Date(now);
    d.setDate(d.getDate() - dayOffset);
    const dateStr  = d.toISOString().slice(0, 10);
    const numTx    = Math.floor(Math.random() * 3);
    for (let i = 0; i < numTx; i++) {
      const m  = merchants[Math.floor(Math.random() * merchants.length)];
      const jitter = m.cat !== 'cat_rent' && m.cat !== 'cat_income' ? (Math.random() - 0.5) * 5 : 0;
      const hash   = Buffer.from(`${dateStr}|${m.name}|${m.amt}|${i}|${dayOffset}`).toString('base64');
      await db.runAsync(
        'INSERT OR IGNORE INTO transactions (id, profile_id, date, merchant, amount, category_id, source, hash, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
        [generateId('tx'), profileId, dateStr, m.name, m.amt + jitter, m.cat, 'demo', hash, new Date().toISOString()]
      );
    }
  }

  // Sample budgets
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const yr = String(now.getFullYear());
  for (const [catId, limit] of [['cat_food', 400], ['cat_shopping', 300], ['cat_entertainment', 80], ['cat_transport', 200]]) {
    await db.runAsync(
      'INSERT OR IGNORE INTO budgets (id, profile_id, category_id, month, year, limit_amount, created_at) VALUES (?,?,?,?,?,?,?)',
      [generateId('budget'), profileId, catId, mo, yr, limit, new Date().toISOString()]
    );
  }
}
