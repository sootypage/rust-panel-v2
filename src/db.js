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
  ram_mb INTEGER NOT NULL DEFAULT 4096,
  mc_software TEXT NOT NULL DEFAULT 'paper',
  mc_version TEXT,
  jar_name TEXT,
  mc_motd TEXT,
  maxplayers INTEGER NOT NULL DEFAULT 50,
  worldsize INTEGER NOT NULL DEFAULT 3500,
  seed INTEGER NOT NULL DEFAULT 0,
  level TEXT NOT NULL DEFAULT 'Procedural Map',
  modded INTEGER NOT NULL DEFAULT 0,
  owner_user_id INTEGER,
  import_code TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS server_users (
  server_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(server_id, user_id)
);
`);

function hasColumn(table, col){
  return db.prepare(`PRAGMA table_info(${table})`).all().some(r=>r.name===col);
}

// Lightweight migrations for existing installs
try{
  if(!hasColumn("servers","import_code")){
    db.exec("ALTER TABLE servers ADD COLUMN import_code TEXT");
  }
  if(!hasColumn("servers","ram_mb")){
    db.exec("ALTER TABLE servers ADD COLUMN ram_mb INTEGER NOT NULL DEFAULT 4096");
  }
  if(!hasColumn("servers","mc_version")){
    db.exec("ALTER TABLE servers ADD COLUMN mc_version TEXT");
  }
  if(!hasColumn("servers","jar_name")){
    db.exec("ALTER TABLE servers ADD COLUMN jar_name TEXT");
  }
  if(!hasColumn("servers","mc_software")){
    db.exec("ALTER TABLE servers ADD COLUMN mc_software TEXT NOT NULL DEFAULT 'paper'");
  }
  if(!hasColumn("servers","mc_motd")){
    db.exec("ALTER TABLE servers ADD COLUMN mc_motd TEXT");
  }
}catch{}

module.exports = { db };
