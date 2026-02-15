// src/db.js
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const dbPath = path.join(process.cwd(), "data", "panel.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS servers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  base_dir TEXT NOT NULL,
  start_cmd TEXT NOT NULL,
  modded INTEGER NOT NULL DEFAULT 0,
  memory_mib INTEGER,
  max_players INTEGER NOT NULL DEFAULT 100,
  server_port INTEGER NOT NULL DEFAULT 28015,
  rcon_host TEXT DEFAULT '127.0.0.1',
  rcon_port INTEGER NOT NULL DEFAULT 28016,
  rcon_password TEXT,
  service_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

function colExists(table, col) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  return rows.some(r => r.name === col);
}

const migrations = [
  ["servers", "modded", "ALTER TABLE servers ADD COLUMN modded INTEGER NOT NULL DEFAULT 0"],
  ["servers", "memory_mib", "ALTER TABLE servers ADD COLUMN memory_mib INTEGER"],
  ["servers", "max_players", "ALTER TABLE servers ADD COLUMN max_players INTEGER NOT NULL DEFAULT 100"],
  ["servers", "server_port", "ALTER TABLE servers ADD COLUMN server_port INTEGER NOT NULL DEFAULT 28015"],
  ["servers", "rcon_host", "ALTER TABLE servers ADD COLUMN rcon_host TEXT DEFAULT '127.0.0.1'"],
  ["servers", "rcon_port", "ALTER TABLE servers ADD COLUMN rcon_port INTEGER NOT NULL DEFAULT 28016"],
  ["servers", "rcon_password", "ALTER TABLE servers ADD COLUMN rcon_password TEXT"],
];

for (const [t, c, sql] of migrations) {
  if (!colExists(t, c)) db.exec(sql);
}

module.exports = { db };
