const bcrypt = require("bcrypt");
const { db } = require("./db");

/**
 * Creates the initial owner user exactly once.
 * If users exist already, does nothing.
 * Uses OWNER_USERNAME / OWNER_PASSWORD from .env.
 */
async function ensureInitialOwner(){
  const c = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
  if (c > 0) return;

  const username = String(process.env.OWNER_USERNAME || "owner").trim();
  const password = String(process.env.OWNER_PASSWORD || "changeme");

  if (!username || !password) {
    throw new Error("OWNER_USERNAME/OWNER_PASSWORD missing and no users exist. Set them in .env then restart.");
  }
  const hash = bcrypt.hashSync(password, 12);
  db.prepare("INSERT INTO users (username,password_hash,role) VALUES (?,?,?)")
    .run(username, hash, "owner");
  console.log(`[panel] Created initial owner user: ${username}`);
}

module.exports = { ensureInitialOwner };
