const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, '..', '..', 'scriptorium.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Auto-create tables ──
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    nickname TEXT DEFAULT '旅人',
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT DEFAULT '未命名思辨',
    topic TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS nodes (
    pk INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    parent_id TEXT,
    label TEXT NOT NULL,
    layer_depth INTEGER DEFAULT 0,
    status TEXT DEFAULT 'stable',
    x REAL DEFAULT 300.0,
    y REAL DEFAULT 220.0,
    cognitive_dimension TEXT DEFAULT 'general',
    description TEXT DEFAULT ''
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS edges (
    pk INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    source_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    type TEXT DEFAULT 'normal',
    description TEXT DEFAULT ''
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

// ── Helpers ──
function genId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

// ── Ensure default user exists ──
const existing = db.prepare('SELECT id FROM users WHERE id = ?').get('default_user');
if (!existing) {
  db.prepare('INSERT INTO users (id, nickname) VALUES (?, ?)').run('default_user', '旅人');
}

module.exports = { db, genId };
