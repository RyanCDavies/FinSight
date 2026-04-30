import { deleteItemAsync, getItemAsync, setItemAsync } from '../platform/secureStore';
import { readJsonFile, writeJsonFile } from '../platform/windowsStorage';

const DB_FILENAME = 'finsight-db.json';

const DEFAULT_CATEGORIES = [
  { id: 'cat_food', name: 'Food & Dining', icon: '🍽️', color: '#f97316', keywords: ['restaurant', 'cafe', 'mcdonald', 'starbucks', 'pizza', 'sushi', 'burger', 'taco', 'diner', 'doordash', 'ubereats', 'food'] },
  { id: 'cat_transport', name: 'Transportation', icon: '🚗', color: '#3b82f6', keywords: ['uber', 'lyft', 'gas', 'shell', 'chevron', 'parking', 'transit', 'metro', 'bus', 'train', 'airline', 'delta', 'united'] },
  { id: 'cat_shopping', name: 'Shopping', icon: '🛍️', color: '#a855f7', keywords: ['amazon', 'target', 'walmart', 'costco', 'nordstrom', 'macy', 'ebay', 'shop', 'store', 'mall'] },
  { id: 'cat_health', name: 'Health & Medical', icon: '💊', color: '#10b981', keywords: ['pharmacy', 'cvs', 'walgreen', 'doctor', 'hospital', 'clinic', 'dental', 'medical'] },
  { id: 'cat_entertainment', name: 'Entertainment', icon: '🎬', color: '#ec4899', keywords: ['netflix', 'spotify', 'hulu', 'disney', 'cinema', 'theater', 'concert', 'game', 'steam', 'playstation'] },
  { id: 'cat_utilities', name: 'Utilities & Bills', icon: '💡', color: '#f59e0b', keywords: ['electric', 'water', 'internet', 'phone', 'verizon', 'att', 'comcast', 'bill', 'utility'] },
  { id: 'cat_rent', name: 'Housing & Rent', icon: '🏠', color: '#6366f1', keywords: ['rent', 'mortgage', 'hoa', 'lease', 'property'] },
  { id: 'cat_income', name: 'Income', icon: '💰', color: '#22c55e', keywords: ['payroll', 'salary', 'deposit', 'paycheck', 'direct deposit'] },
  { id: 'cat_other', name: 'Other', icon: '📦', color: '#94a3b8', keywords: [] },
];

const runtime = globalThis.__finsightWindowsDbRuntime || (globalThis.__finsightWindowsDbRuntime = {
  loaded: false,
  loadingPromise: null,
  persistQueue: Promise.resolve(),
  state: null,
});

function createEmptyState() {
  return {
    profiles: [],
    categories: [],
    transactions: [],
    budgets: [],
  };
}

function buildDefaultCategories() {
  return DEFAULT_CATEGORIES.map((category) => ({
    ...category,
    keywords: JSON.stringify(category.keywords),
    is_system: 1,
  }));
}

function normalizeState(rawState) {
  const nextState = {
    ...createEmptyState(),
    ...(rawState || {}),
  };

  nextState.profiles = Array.isArray(nextState.profiles) ? nextState.profiles : [];
  nextState.categories = Array.isArray(nextState.categories) ? nextState.categories : [];
  nextState.transactions = Array.isArray(nextState.transactions) ? nextState.transactions : [];
  nextState.budgets = Array.isArray(nextState.budgets) ? nextState.budgets : [];
  nextState.budgets = nextState.budgets.map((budget) => ({
    ...budget,
    description: typeof budget.description === 'string' ? budget.description : '',
  }));

  if (nextState.categories.length === 0) {
    nextState.categories = buildDefaultCategories();
  } else {
    const defaultsById = new Map(buildDefaultCategories().map((category) => [category.id, category]));
    nextState.categories = nextState.categories.map((category) => {
      const systemDefault = defaultsById.get(category.id);
      if (!systemDefault || Number(category.is_system) !== 1) {
        return category;
      }

      return {
        ...category,
        name: systemDefault.name,
        icon: systemDefault.icon,
        color: systemDefault.color,
        keywords: systemDefault.keywords,
      };
    });
  }

  return nextState;
}

function snapshotState() {
  return JSON.parse(JSON.stringify(runtime.state || createEmptyState()));
}

function queuePersist() {
  runtime.persistQueue = runtime.persistQueue.catch(() => undefined).then(async () => {
    if (!runtime.loaded || !runtime.state) return;
    await writeJsonFile(DB_FILENAME, snapshotState());
  });

  return runtime.persistQueue;
}

async function ensureState() {
  if (runtime.loaded && runtime.state) {
    runtime.state = normalizeState(runtime.state);
    return runtime.state;
  }

  if (!runtime.loadingPromise) {
    runtime.loadingPromise = (async () => {
      const storedState = await readJsonFile(DB_FILENAME, createEmptyState());
      runtime.state = normalizeState(storedState);
      runtime.loaded = true;
      runtime.loadingPromise = null;
      await queuePersist();
      return runtime.state;
    })();
  }

  return runtime.loadingPromise;
}

function normalizeSql(sql) {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function cloneRecord(record) {
  return record ? { ...record } : null;
}

function cloneRows(rows) {
  return rows.map((row) => ({ ...row }));
}

function filterTransactions(state, profileId, sql, params) {
  let rows = state.transactions.filter((transaction) => transaction.profile_id === profileId);

  if (sql.includes('date like ?')) {
    const datePattern = String(params.shift()).replace(/%/g, '');
    rows = rows.filter((transaction) => (transaction.date || '').startsWith(datePattern));
  }

  if (sql.includes('category_id = ?')) {
    const categoryId = params.shift();
    rows = rows.filter((transaction) => transaction.category_id === categoryId);
  }

  if (sql.includes('(lower(merchant) like ? or lower(note) like ?)')) {
    const searchValue = String(params.shift()).replace(/%/g, '').toLowerCase();
    params.shift();
    rows = rows.filter((transaction) => {
      const merchant = (transaction.merchant || '').toLowerCase();
      const note = (transaction.note || '').toLowerCase();
      return merchant.includes(searchValue) || note.includes(searchValue);
    });
  }

  if (sql.includes('amount < 0')) {
    rows = rows.filter((transaction) => Number(transaction.amount) < 0);
  }

  if (sql.includes('order by date desc')) {
    rows = [...rows].sort((left, right) => String(right.date).localeCompare(String(left.date)));
  }

  return rows;
}

const db = {
  async execAsync() {
    await ensureState();
  },

  async getFirstAsync(query, params = []) {
    const state = await ensureState();
    const sql = normalizeSql(query);

    if (sql === 'select id from profiles where email = ?') {
      const profile = state.profiles.find((item) => item.email === params[0]);
      return profile ? { id: profile.id } : null;
    }

    if (sql === 'select * from profiles where email = ?') {
      return cloneRecord(state.profiles.find((item) => item.email === params[0]) || null);
    }

    if (sql === 'select * from profiles where id = ?') {
      return cloneRecord(state.profiles.find((item) => item.id === params[0]) || null);
    }

    if (sql === 'select count(*) as c from categories') {
      return { c: state.categories.length };
    }

    if (sql === 'select count(*) as c from transactions where profile_id = ?') {
      return { c: state.transactions.filter((item) => item.profile_id === params[0]).length };
    }

    if (sql === 'select count(*) as c from budgets where profile_id = ?') {
      return { c: state.budgets.filter((item) => item.profile_id === params[0]).length };
    }

    if (sql === 'select * from transactions where id = ?') {
      return cloneRecord(state.transactions.find((item) => item.id === params[0]) || null);
    }

    throw new Error(`Unsupported getFirstAsync query on Windows: ${query}`);
  },

  async getAllAsync(query, params = []) {
    const state = await ensureState();
    const sql = normalizeSql(query);
    const mutableParams = [...params];

    if (sql === 'select * from categories') {
      return cloneRows(state.categories);
    }

    if (sql.startsWith('select * from transactions where profile_id = ?')) {
      const profileId = mutableParams.shift();
      return cloneRows(filterTransactions(state, profileId, sql, mutableParams));
    }

    if (sql === 'select hash from transactions where profile_id = ? and hash is not null') {
      return state.transactions
        .filter((item) => item.profile_id === params[0] && item.hash != null)
        .map((item) => ({ hash: item.hash }));
    }

    if (sql === 'select * from budgets where profile_id = ?') {
      return cloneRows(state.budgets.filter((item) => item.profile_id === params[0]));
    }

    if (sql === 'select * from budgets where profile_id = ? and month = ? and year = ?') {
      return cloneRows(
        state.budgets.filter((item) =>
          item.profile_id === params[0] &&
          item.month === params[1] &&
          item.year === params[2]
        )
      );
    }

    if (sql === 'select category_id, sum(amount) as total from transactions where profile_id = ? and date like ? and amount < 0 group by category_id') {
      const grouped = new Map();
      const profileId = params[0];
      const datePrefix = String(params[1]).replace(/%/g, '');

      state.transactions
        .filter((item) =>
          item.profile_id === profileId &&
          (item.date || '').startsWith(datePrefix) &&
          Number(item.amount) < 0
        )
        .forEach((item) => {
          grouped.set(item.category_id, (grouped.get(item.category_id) || 0) + Number(item.amount));
        });

      return Array.from(grouped.entries()).map(([category_id, total]) => ({ category_id, total }));
    }

    throw new Error(`Unsupported getAllAsync query on Windows: ${query}`);
  },

  async runAsync(query, params = []) {
    const state = await ensureState();
    const sql = normalizeSql(query);
    let changed = false;

    if (sql.startsWith('insert into profiles ')) {
      const [id, name, email, pin_hash, created_at, preferences] = params;
      state.profiles.push({ id, name, email, pin_hash, created_at, preferences });
      changed = true;
    } else if (sql.startsWith('insert or ignore into categories ')) {
      const [id, name, icon, color, keywords, is_system] = params;
      if (!state.categories.find((item) => item.id === id)) {
        state.categories.push({ id, name, icon, color, keywords, is_system });
        changed = true;
      }
    } else if (sql.startsWith('insert into transactions ') || sql.startsWith('insert or ignore into transactions ')) {
      const columnsMatch = query.match(/\(([^)]+)\)\s*values/i);
      const columns = columnsMatch ? columnsMatch[1].split(',').map((column) => column.trim()) : [];
      const row = {
        note: '',
        source: 'manual',
        hash: null,
      };

      columns.forEach((column, index) => {
        row[column] = params[index];
      });

      if (sql.startsWith('insert or ignore into transactions ') && row.hash) {
        const existing = state.transactions.find((item) => item.hash === row.hash);
        if (!existing) {
          state.transactions.push(row);
          changed = true;
        }
      } else {
        state.transactions.push(row);
        changed = true;
      }
    } else if (sql.startsWith('update transactions set ')) {
      const targetId = params[params.length - 1];
      const transaction = state.transactions.find((item) => item.id === targetId);
      if (transaction) {
        const fields = (query.match(/update transactions set (.+) where id = \?/i)?.[1] || '')
          .split(',')
          .map((segment) => segment.split('=')[0].trim())
          .filter(Boolean);

        fields.forEach((field, index) => {
          transaction[field] = params[index];
        });
        changed = true;
      }
    } else if (sql === 'delete from transactions where id = ?') {
      const nextTransactions = state.transactions.filter((item) => item.id !== params[0]);
      changed = nextTransactions.length !== state.transactions.length;
      state.transactions = nextTransactions;
    } else if (sql === 'delete from transactions where profile_id = ?') {
      const nextTransactions = state.transactions.filter((item) => item.profile_id !== params[0]);
      changed = nextTransactions.length !== state.transactions.length;
      state.transactions = nextTransactions;
    } else if (sql.startsWith('insert into budgets ') && sql.includes('on conflict')) {
      const [id, profile_id, category_id, month, year, limit_amount, description, created_at] = params;
      const existing = state.budgets.find((item) =>
        item.profile_id === profile_id &&
        item.category_id === category_id &&
        item.month === month &&
        item.year === year
      );

      if (existing) {
        existing.limit_amount = limit_amount;
        existing.description = description;
      } else {
        state.budgets.push({ id, profile_id, category_id, month, year, limit_amount, description, created_at });
      }
      changed = true;
    } else if (sql.startsWith('insert or ignore into budgets ')) {
      const [id, profile_id, category_id, month, year, limit_amount, description, created_at] = params;
      const existing = state.budgets.find((item) =>
        item.profile_id === profile_id &&
        item.category_id === category_id &&
        item.month === month &&
        item.year === year
      );

      if (!existing) {
        state.budgets.push({ id, profile_id, category_id, month, year, limit_amount, description, created_at });
        changed = true;
      }
    } else if (sql === 'update budgets set category_id = ?, limit_amount = ?, description = ? where id = ?') {
      const [category_id, limit_amount, description, id] = params;
      const existing = state.budgets.find((item) => item.id === id);
      if (existing) {
        existing.category_id = category_id;
        existing.limit_amount = limit_amount;
        existing.description = description;
        changed = true;
      }
    } else if (sql === 'delete from budgets where id = ?') {
      const nextBudgets = state.budgets.filter((item) => item.id !== params[0]);
      changed = nextBudgets.length !== state.budgets.length;
      state.budgets = nextBudgets;
    } else if (sql === 'delete from budgets where profile_id = ?') {
      const nextBudgets = state.budgets.filter((item) => item.profile_id !== params[0]);
      changed = nextBudgets.length !== state.budgets.length;
      state.budgets = nextBudgets;
    } else {
      throw new Error(`Unsupported runAsync query on Windows: ${query}`);
    }

    if (changed) {
      await queuePersist();
    }
  },
};

export async function getDB() {
  await ensureState();
  return db;
}

export async function saveSession(profileId) {
  await setItemAsync('finsight_session', profileId);
}

export async function getSession() {
  return getItemAsync('finsight_session');
}

export async function clearSession() {
  await deleteItemAsync('finsight_session');
}

export function generateId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function hashPin(pin) {
  let hash = 0;
  const value = `${pin}finsight_salt_v1`;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return hash.toString(36);
}
