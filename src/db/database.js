// src/db/database.js
// Layer 4: Data Access & Storage Layer
// Real SQLite implementation using expo-sqlite
// Database file location: <app-data>/SQLite/finsight.db
// Openable in DB Browser for SQLite via adb pull or Expo dev tools

import * as SQLite from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';

let _db = null;

export async function getDB() {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('finsight.db');
  await _db.execAsync('PRAGMA journal_mode = WAL;');
  await _db.execAsync('PRAGMA foreign_keys = ON;');
  await initSchema(_db);
  return _db;
}

async function initSchema(db) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS profiles (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      email       TEXT UNIQUE NOT NULL,
      pin_hash    TEXT NOT NULL,
      created_at  TEXT NOT NULL,
      preferences TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS categories (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      icon       TEXT,
      color      TEXT,
      keywords   TEXT DEFAULT '[]',
      is_system  INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id          TEXT PRIMARY KEY,
      profile_id  TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      date        TEXT NOT NULL,
      merchant    TEXT,
      amount      REAL NOT NULL,
      category_id TEXT REFERENCES categories(id),
      note        TEXT DEFAULT '',
      source      TEXT DEFAULT 'manual',
      hash        TEXT,
      created_at  TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tx_profile  ON transactions(profile_id);
    CREATE INDEX IF NOT EXISTS idx_tx_date     ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category_id);

    CREATE TABLE IF NOT EXISTS budgets (
      id           TEXT PRIMARY KEY,
      profile_id   TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      category_id  TEXT NOT NULL REFERENCES categories(id),
      month        TEXT NOT NULL,
      year         TEXT NOT NULL,
      limit_amount REAL NOT NULL,
      created_at   TEXT NOT NULL,
      UNIQUE(profile_id, category_id, month, year)
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id         TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      merchant   TEXT NOT NULL,
      amount     REAL NOT NULL,
      frequency  TEXT,
      last_seen  TEXT,
      is_active  INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS anomalies (
      id             TEXT PRIMARY KEY,
      profile_id     TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      transaction_id TEXT REFERENCES transactions(id),
      type           TEXT,
      description    TEXT,
      severity       TEXT,
      detected_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS forecasts (
      id               TEXT PRIMARY KEY,
      profile_id       TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      category_id      TEXT NOT NULL REFERENCES categories(id),
      month            TEXT NOT NULL,
      year             TEXT NOT NULL,
      predicted_amount REAL,
      confidence       REAL,
      generated_at     TEXT NOT NULL
    );
  `);

  await seedCategories(db);
}

const DEFAULT_CATEGORIES = [
  { id: 'cat_food',          name: 'Food & Dining',     icon: 'ðŸ”', color: '#f97316', keywords: ['restaurant','cafe','mcdonald','starbucks','pizza','sushi','burger','taco','diner','doordash','ubereats','food'] },
  { id: 'cat_transport',     name: 'Transportation',    icon: 'ðŸš—', color: '#3b82f6', keywords: ['uber','lyft','gas','shell','chevron','parking','transit','metro','bus','train','airline','delta','united'] },
  { id: 'cat_shopping',      name: 'Shopping',          icon: 'ðŸ›ï¸', color: '#a855f7', keywords: ['amazon','target','walmart','costco','nordstrom','macy','ebay','shop','store','mall'] },
  { id: 'cat_health',        name: 'Health & Medical',  icon: 'ðŸ’Š', color: '#10b981', keywords: ['pharmacy','cvs','walgreen','doctor','hospital','clinic','dental','medical'] },
  { id: 'cat_entertainment', name: 'Entertainment',     icon: 'ðŸŽ¬', color: '#ec4899', keywords: ['netflix','spotify','hulu','disney','cinema','theater','concert','game','steam','playstation'] },
  { id: 'cat_utilities',     name: 'Utilities & Bills', icon: 'ðŸ’¡', color: '#f59e0b', keywords: ['electric','water','internet','phone','verizon','att','comcast','bill','utility'] },
  { id: 'cat_rent',          name: 'Housing & Rent',    icon: 'ðŸ ', color: '#6366f1', keywords: ['rent','mortgage','hoa','lease','property'] },
  { id: 'cat_income',        name: 'Income',            icon: 'ðŸ’°', color: '#22c55e', keywords: ['payroll','salary','deposit','paycheck','direct deposit'] },
  { id: 'cat_other',         name: 'Other',             icon: 'ðŸ“¦', color: '#94a3b8', keywords: [] },
];

async function seedCategories(db) {
  const existing = await db.getFirstAsync('SELECT COUNT(*) as c FROM categories');
  if (existing.c > 0) return;
  for (const cat of DEFAULT_CATEGORIES) {
    await db.runAsync(
      'INSERT OR IGNORE INTO categories (id, name, icon, color, keywords, is_system) VALUES (?,?,?,?,?,1)',
      [cat.id, cat.name, cat.icon, cat.color, JSON.stringify(cat.keywords)]
    );
  }
}

export async function saveSession(profileId) {
  await SecureStore.setItemAsync('finsight_session', profileId);
}

export async function getSession() {
  return SecureStore.getItemAsync('finsight_session');
}

export async function clearSession() {
  await SecureStore.deleteItemAsync('finsight_session');
}

export function generateId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function hashPin(pin) {
  let hash = 0;
  const str = pin + 'finsight_salt_v1';
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(36);
}
