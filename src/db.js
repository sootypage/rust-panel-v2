const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const DATA_DIR = process.env.DATA_DIR || "./data";
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, "panel.db"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS servers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  game TEXT NOT NULL DEFAULT 'rust',
  base_dir TEXT NOT NULL,
  server_port INTEGER NOT NULL DEFAULT 28015,
  query_port INTEGER NOT NULL DEFAULT 28017,
  rcon_host TEXT NOT NULL DEFAULT '127.0.0.1',
  rcon_port INTEGER NOT NULL DEFAULT 28016,
  rcon_password TEXT NOT NULL DEFAULT '',
  maxplayers INTEGER NOT NULL DEFAULT 50,
  worldsize INTEGER NOT NULL DEFAULT 3500,
  seed INTEGER NOT NULL DEFAULT 0,
  level TEXT NOT NULL DEFAULT 'Procedural Map',
  modded INTEGER NOT NULL DEFAULT 0,
  owner_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

module.exports = { db };
