// src/services/index.js
// Layer 2: Application Logic / Services Layer
// All services use the real SQLite DB via expo-sqlite

import { getDB, generateId, hashPin, saveSession, clearSession } from '../db/database';
import { emitDataChanged } from '../db/changeEvents';
import { CategorizationEngine, AnomalyDetectionEngine, ForecastingEngine, RecommendationEngine, SubscriptionEngine } from '../engines';
import { AIModelManager, AIRuntime } from '../ai';

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
      const category_id = data.category_id || CategorizationEngine.resolveCategory(data, cats);
      const hash = data.hash || null;

      if (hash) {
        const existing = await db.getFirstAsync(
          'SELECT * FROM transactions WHERE profile_id = ? AND hash = ? LIMIT 1',
          [profileId, hash]
        );
        if (existing) {
          return { ...existing, duplicate: true };
        }
      }

      const id = generateId('tx');
  
      await db.runAsync(
        'INSERT INTO transactions (id, profile_id, date, merchant, amount, category_id, note, source, hash, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [id, profileId, data.date, data.merchant, data.amount, category_id, data.note || '', data.source || 'manual', hash, new Date().toISOString()]
      );
      emitDataChanged();
      return db.getFirstAsync('SELECT * FROM transactions WHERE id = ?', [id]);
    },

  async updateTransaction(id, updates) {
    const db = await getDB();
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(updates), id];
    await db.runAsync(`UPDATE transactions SET ${fields} WHERE id = ?`, values);
    emitDataChanged();
    return db.getFirstAsync('SELECT * FROM transactions WHERE id = ?', [id]);
  },

  async deleteTransaction(id) {
    const db = await getDB();
    await db.runAsync('DELETE FROM transactions WHERE id = ?', [id]);
    emitDataChanged();
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
  normalizeAmount(value) {
    const raw = String(value || '').trim();
    if (!raw) return NaN;
    const negative = raw.includes('(') && raw.includes(')') ? -1 : 1;
    const normalized = raw.replace(/[$,\s()]/g, '');
    const parsed = parseFloat(normalized);
    if (Number.isNaN(parsed)) return NaN;
    return parsed * negative;
  },

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
      amount:   this.normalizeAmount(r[mapping.amount] || '0'),
      note:     r[mapping.note] || '',
      category: mapping.category ? (r[mapping.category] || '') : '',
    })).filter(r => r.date && !isNaN(r.amount));
  },

  parseOCRText(text) {
    const lines = String(text || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const dateRegex = /(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)/;
    const amountRegex = /[-+]?[$]?\(?\d[\d,]*\.\d{2}\)?/g;
    const rows = [];

      const normalizeDate = (value) => {
        if (!value) return '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

        const [left, middle, right] = value.split(/[/-]/);
        const fallbackYear = String(new Date().getFullYear());
        const rawYear = right || fallbackYear;
        const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
        return `${year.padStart(4, '20')}-${middle.padStart(2, '0')}-${left.padStart(2, '0')}`;
      };

    for (const line of lines) {
      const dateMatch = line.match(dateRegex);
      const amounts = line.match(amountRegex) || [];
      if (!dateMatch || !amounts.length) continue;

      const amountText = amounts[amounts.length - 1];
      let amount = this.normalizeAmount(amountText);
      if (Number.isNaN(amount)) continue;

      const merchant = line
        .replace(dateMatch[0], '')
        .replace(amountText, '')
        .replace(/\b(card|purchase|debit|credit|pending|posted|pos|visa|mc)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (!merchant) continue;

      if (amount > 0 && !/\b(payroll|deposit|refund|credit|interest|income)\b/i.test(line)) {
        amount *= -1;
      }

      const note = line !== merchant ? line : '';
      rows.push({
        date: normalizeDate(dateMatch[0]),
        merchant,
        amount,
        note,
        category: '',
      });
    }

    if (!rows.length) {
      const fullText = lines.join('\n');
      const fullTextLower = fullText.toLowerCase();
      const preferredAmountLine = lines.find((line) =>
        /\b(grand total|total due|amount due|amount paid|payment total|total|balance due)\b/i.test(line)
      );
      const receiptAmounts = (preferredAmountLine || fullText).match(amountRegex) || [];
      const dateMatch = fullText.match(dateRegex);
      const merchantLine = lines.find((line) =>
        /[a-z]/i.test(line) &&
        !dateRegex.test(line) &&
        !(line.match(amountRegex) || []).length &&
        !/\b(receipt|invoice|subtotal|tax|change|cash|visa|mastercard|amex|thank you)\b/i.test(line)
      );

      if (receiptAmounts.length && merchantLine) {
        let amount = this.normalizeAmount(receiptAmounts[receiptAmounts.length - 1]);
        if (!Number.isNaN(amount)) {
          if (amount > 0 && !/\b(refund|deposit|credit|income|payroll)\b/i.test(fullTextLower)) {
            amount *= -1;
          }

          return {
            rows: [
              {
                date: dateMatch ? normalizeDate(dateMatch[0]) : new Date().toISOString().slice(0, 10),
                merchant: merchantLine.replace(/\s+/g, ' ').trim(),
                amount,
                note: fullText,
                category: '',
              },
            ],
          };
        }
      }

      return { error: 'No transaction-like rows were detected. Scan a receipt, statement, or OCR text that includes a recognizable amount.' };
    }

    return { rows };
  },

  generateHash(tx) {
    return Buffer.from(`${tx.date}|${tx.merchant}|${tx.amount}`).toString('base64');
  },

  async importTransactions(profileId, mappedRows, source = 'csv') {
    const db = await getDB();
    const existing = await db.getAllAsync(
      'SELECT hash FROM transactions WHERE profile_id = ? AND hash IS NOT NULL',
      [profileId]
    );
    const existingHashes = new Set(existing.map(t => t.hash));
    const cats = await db.getAllAsync('SELECT * FROM categories');

    let imported = 0, duplicates = 0, autoCategorized = 0, uncategorized = 0;
    for (const row of mappedRows) {
      const hash = this.generateHash(row);
      if (existingHashes.has(hash)) { duplicates++; continue; }
      const explicitCategory = CategorizationEngine.findExplicitCategory(row.category, cats);
      const category_id = explicitCategory?.id || CategorizationEngine.resolveCategory(row, cats);
      if (!explicitCategory && category_id !== 'cat_other') autoCategorized++;
      if (category_id === 'cat_other') uncategorized++;
      await db.runAsync(
        'INSERT INTO transactions (id, profile_id, date, merchant, amount, category_id, note, source, hash, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [generateId('tx'), profileId, row.date, row.merchant, row.amount, category_id, row.note || '', source, hash, new Date().toISOString()]
      );
      imported++;
    }
    if (imported > 0) {
      emitDataChanged();
    }
    return { imported, duplicates, autoCategorized, uncategorized };
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

  async setBudget(profileId, categoryId, month, year, limitAmount, description = '') {
    const db = await getDB();
    await db.runAsync(
      `INSERT INTO budgets (id, profile_id, category_id, month, year, limit_amount, description, created_at)
       VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(profile_id, category_id, month, year) DO UPDATE SET limit_amount = excluded.limit_amount, description = excluded.description`,
      [generateId('budget'), profileId, categoryId, month, year, limitAmount, description, new Date().toISOString()]
    );
    emitDataChanged();
  },

  async updateBudget(id, { categoryId, limitAmount, description = '' }) {
    const db = await getDB();
    await db.runAsync(
      'UPDATE budgets SET category_id = ?, limit_amount = ?, description = ? WHERE id = ?',
      [categoryId, limitAmount, description, id]
    );
    emitDataChanged();
  },

  async deleteBudget(id) {
    const db = await getDB();
    await db.runAsync('DELETE FROM budgets WHERE id = ?', [id]);
    emitDataChanged();
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
    const monthlyTrend = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
      return {
        key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
        label: date.toLocaleDateString('en-US', { month: 'short' }),
        fullLabel: date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        spend: 0,
        income: 0,
      };
    });
    const monthlyTrendByKey = Object.fromEntries(monthlyTrend.map((month) => [month.key, month]));

    allTx.forEach((transaction) => {
      const monthKey = String(transaction.date || '').slice(0, 7);
      const targetMonth = monthlyTrendByKey[monthKey];
      if (!targetMonth) return;

      const amount = parseFloat(transaction.amount);
      if (Number.isNaN(amount)) return;

      if (amount < 0) targetMonth.spend += Math.abs(amount);
      if (amount > 0) targetMonth.income += amount;
    });

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

    return { totalSpend, lastMonthSpend, totalIncome, monthlyTrend, spendByCategory, cats, budgets, recommendations, anomalies, subscriptions, forecasts };
  },
};

function formatCurrency(amount) {
  return `$${Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function normalizeAssistantText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s&/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildFallbackAnswer(message, context) {
  const lower = normalizeAssistantText(message);
  const topCategory = Object.entries(context.spendByCategory || {}).sort((left, right) => right[1] - left[1])[0];
  const overBudget = (context.budgets || []).filter((budget) => budget.limit && budget.spent / budget.limit >= 0.9);
  const recentTransactions = [...(context.transactions || [])]
    .sort((left, right) => String(right.date || '').localeCompare(String(left.date || '')))
    .slice(0, 3);
  const merchantMatch = Array.from(new Set((context.transactions || []).map((transaction) => transaction.merchant).filter(Boolean))).find((merchant) => {
    const normalized = normalizeAssistantText(merchant);
    return normalized && lower.includes(normalized);
  });
  const categoryMatch = (context.categories || []).find((category) => {
    const normalized = normalizeAssistantText(category.name);
    return normalized && lower.includes(normalized);
  });

  if (!lower) {
    return 'Ask about spending, budgets, transactions, subscriptions, imports, or simple finance topics like cash flow.';
  }

  if (/\b(hi|hello|hey)\b/.test(lower)) {
    return 'Hi. I can answer from your local FinSight data or handle simple finance questions that do not need personal data.';
  }

  if (/\b(what can you do|help)\b/.test(lower)) {
    return 'I can summarize spending, review budgets, inspect recent transactions, look for subscriptions, and answer basic finance questions directly in the app.';
  }

  if (/\b(what is cash flow|define cash flow)\b/.test(lower)) {
    return 'Cash flow is the amount of money coming in minus the amount going out during a period.';
  }

  if (lower.includes('budget')) {
    if (!context.budgets?.length) {
      return 'You do not have active budgets yet. Start with your biggest spending category so the assistant can track progress against a monthly target.';
    }

    if (!overBudget.length) {
      return 'Your tracked budgets are not near the limit right now. Keep watching your top spending category and check again around mid-month.';
    }

    return overBudget
      .slice(0, 2)
      .map((budget) => `${budget.category} is at ${Math.round((budget.spent / budget.limit) * 100)}% of budget (${formatCurrency(budget.spent)} of ${formatCurrency(budget.limit)}).`)
      .join(' ');
  }

  if (lower.includes('save') || lower.includes('cut back')) {
    if (topCategory) {
      return `${topCategory[0]} is your largest spending area at ${formatCurrency(topCategory[1])}. Reducing that category by 10% would save about ${formatCurrency(topCategory[1] * 0.1)} this month.`;
    }

    return 'Import a few transactions first and I can point to the most expensive category.';
  }

  if (lower.includes('food') || lower.includes('dining')) {
    const foodSpend = Number((context.spendByCategory || {})['Food & Dining'] || 0);
    return `Food and dining spend is ${formatCurrency(foodSpend)} this month. Trimming even one or two restaurant purchases each week would move that number quickly.`;
  }

  if (/\b(recent|latest|last)\b/.test(lower) && /\b(transaction|purchase|charge|expense)\b/.test(lower)) {
    if (!recentTransactions.length) {
      return 'There are no saved transactions on this device yet.';
    }

    return recentTransactions
      .map((transaction) => `${transaction.date}: ${transaction.merchant || 'Unknown merchant'} for ${formatCurrency(Math.abs(Number(transaction.amount || 0)))} in ${transaction.category}.`)
      .join(' ');
  }

  if (merchantMatch) {
    const matches = (context.transactions || []).filter((transaction) => normalizeAssistantText(transaction.merchant) === normalizeAssistantText(merchantMatch));
    const total = matches.reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount || 0)), 0);
    const latest = [...matches].sort((left, right) => String(right.date || '').localeCompare(String(left.date || '')))[0];
    return `${merchantMatch} appears ${matches.length} time${matches.length === 1 ? '' : 's'} in your saved history for ${formatCurrency(total)} total. The most recent was ${formatCurrency(Math.abs(Number(latest?.amount || 0)))} on ${latest?.date}.`;
  }

  if (categoryMatch) {
    const categorySpend = Number((context.spendByCategory || {})[categoryMatch.name] || 0);
    return categorySpend
      ? `${categoryMatch.name} spending is ${formatCurrency(categorySpend)} this month.`
      : `I do not see spending for ${categoryMatch.name} in the current month yet.`;
  }

  if (lower.includes('subscription') || lower.includes('recurring')) {
    if (!context.subscriptions?.length) {
      return 'No recurring subscriptions are currently detected in your local data.';
    }

    return context.subscriptions
      .slice(0, 3)
      .map((subscription) => `${subscription.merchant} appears ${subscription.frequency} at ${formatCurrency(Math.abs(subscription.amount))}.`)
      .join(' ');
  }

  if (lower.includes('import') || lower.includes('ocr') || lower.includes('categor')) {
    const uncategorized = (context.transactions || []).filter((transaction) => transaction.categoryId === 'cat_other').length;
    return uncategorized
      ? `${uncategorized} imported transactions are still in Other and worth reviewing.`
      : 'Your imported transactions look categorized at a high level from the current local data snapshot.';
  }

  return `${context.summary || 'Your local finance summary is ready.'} ${topCategory ? `Your highest category is ${topCategory[0]} at ${formatCurrency(topCategory[1])}.` : ''}`.trim();
}

export const LocalAIService = {
  async getAssistantContext(profileId) {
    const [profile, dashboardData, transactions] = await Promise.all([
      (async () => {
        const db = await getDB();
        return db.getFirstAsync('SELECT id, name, email, preferences, created_at FROM profiles WHERE id = ?', [profileId]);
      })(),
      ReportingAnalyticsService.getDashboardData(profileId),
      FinancialDataService.getTransactions(profileId),
    ]);

    const categoryNameById = Object.fromEntries((dashboardData.cats || []).map((category) => [category.id, category.name]));

    return {
      profile: profile
        ? {
            id: profile.id,
            name: profile.name,
            email: profile.email,
            createdAt: profile.created_at,
            preferences: (() => {
              try {
                return JSON.parse(profile.preferences || '{}');
              } catch {
                return {};
              }
            })(),
          }
        : null,
      summary: `Spent: $${dashboardData.totalSpend.toFixed(2)}, Income: $${dashboardData.totalIncome.toFixed(2)}`,
      totalSpend: dashboardData.totalSpend,
      totalIncome: dashboardData.totalIncome,
      spendByCategory: Object.fromEntries(
        Object.entries(dashboardData.spendByCategory).map(([key, value]) => [categoryNameById[key] || key, value])
      ),
      categories: (dashboardData.cats || []).map((category) => ({
        id: category.id,
        name: category.name,
        icon: category.icon,
        color: category.color,
      })),
      budgets: (dashboardData.budgets || []).map((budget) => ({
        id: budget.id,
        categoryId: budget.category_id,
        category: categoryNameById[budget.category_id] || budget.category_id,
        limit: budget.limit_amount,
        spent: budget.spent,
        progress: budget.progress,
        description: budget.description || '',
      })),
      anomalies: (dashboardData.anomalies || []).map((anomaly) => ({
        transactionId: anomaly.transaction_id,
        description: anomaly.description,
        severity: anomaly.severity,
        detectedAt: anomaly.detected_at,
      })),
      subscriptions: (dashboardData.subscriptions || []).map((subscription) => ({
        merchant: subscription.merchant,
        amount: subscription.amount,
        frequency: subscription.frequency,
        lastSeen: subscription.last_seen,
        count: subscription.count,
      })),
      forecasts: (dashboardData.forecasts || []).map((entry) => ({
        categoryId: entry.category?.id,
        category: entry.category?.name || entry.category?.id,
        predicted: entry.forecast?.predicted,
        confidence: entry.forecast?.confidence,
      })),
      monthlyTrend: dashboardData.monthlyTrend || [],
      transactions: (transactions || []).map((transaction) => ({
        id: transaction.id,
        date: transaction.date,
        merchant: transaction.merchant,
        amount: transaction.amount,
        note: transaction.note,
        source: transaction.source,
        categoryId: transaction.category_id,
        category: categoryNameById[transaction.category_id] || transaction.category_id || 'Uncategorized',
      })),
    };
  },

  async getStatus() {
    const [status, recommendedModel, backendStatus] = await Promise.all([
      AIModelManager.getStatus(),
      AIModelManager.getRecommendedModel(),
      AIRuntime.getBackendStatus().catch(() => null),
    ]);

    if (status.state === 'installed') {
      return {
        ...status,
        ready: true,
        backendStatus,
        detail: backendStatus?.reason || `${status.name} is installed locally and ready for offline chat plus OCR title cleanup.`,
      };
    }

    if (status.state === 'downloading') {
      return {
        ...status,
        ready: false,
        backendStatus,
        detail: status.detail || `Downloading ${recommendedModel?.name || 'local AI model'}...`,
      };
    }

    return {
      ...status,
      ready: false,
      recommendedModel,
      backendStatus,
      detail: recommendedModel
        ? `Download ${recommendedModel.name} (${Math.round(recommendedModel.sizeBytes / (1024 * 1024))} MB) to enable offline chat and OCR title cleanup.`
        : 'No local AI model manifest is available yet.',
    };
  },

  async installRecommendedModel(onProgress) {
    const model = await AIModelManager.getRecommendedModel();
    if (!model) {
      throw new Error('No recommended local AI model is available.');
    }
    return AIModelManager.install(model.id, onProgress);
  },

  async removeInstalledModel() {
    await AIRuntime.unloadModel();
    return AIModelManager.removeInstalledModel();
  },

  async cancelActiveGeneration() {
    return AIRuntime.cancelGeneration();
  },

  async ask(message, context, onChunk, conversationHistory = []) {
    const status = await AIModelManager.getStatus();
    if (status.state !== 'installed') {
      const fallback = buildFallbackAnswer(message, context);
      onChunk?.(fallback);
      return fallback;
    }

    try {
      await AIRuntime.loadModel();
      const result = await AIRuntime.generate({
        userPrompt: message,
        fullContext: context,
        conversationHistory,
        stopSequences: [
          'USER QUESTION',
          'USER:',
          'Human:',
          'Assistant:',
          '\nFinSight:',
          '\nUser:',
        ],
      });
      const answer = String(result.text || buildFallbackAnswer(message, context)).trim();
      onChunk?.(answer);
      return answer;
    } catch (error) {
      console.warn('Local AI runtime failed:', error);
      const detail = error?.message ? ` Runtime detail: ${error.message}` : '';
      const fallback = `${buildFallbackAnswer(message, context)}\n\nThe local model package is installed, but the offline assistant runtime could not answer this request.${detail}`;
      onChunk?.(fallback);
      return fallback;
    }
  },

  async refineOCRRows(rows, ocrText) {
    if (!Array.isArray(rows) || !rows.length) return rows;

    const status = await AIModelManager.getStatus();
    if (status.state !== 'installed') {
      return rows;
    }

    try {
      await AIRuntime.loadModel();
      const nextRows = await Promise.all(rows.map(async (row) => {
        const suggestedMerchant = await AIRuntime.suggestTransactionTitle({
          merchant: row.merchant,
          note: row.note,
          ocrText,
        });

        return suggestedMerchant
          ? { ...row, merchant: suggestedMerchant }
          : row;
      }));
      return nextRows;
    } catch (error) {
      console.warn('Local AI OCR refinement failed:', error);
      return rows;
    }
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
      'INSERT OR IGNORE INTO budgets (id, profile_id, category_id, month, year, limit_amount, description, created_at) VALUES (?,?,?,?,?,?,?,?)',
      [generateId('budget'), profileId, catId, mo, yr, limit, '', new Date().toISOString()]
    );
  }

  emitDataChanged();
}