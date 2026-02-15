// src/auth.js
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { db } = require("./db");

const SECRET = process.env.JWT_SECRET || "CHANGE_ME_SUPER_SECRET";

function loginHandler(req, res) {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ ok: false, error: "Missing username/password" });

  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!user) return res.status(401).json({ ok: false, error: "Bad login" });

  const ok = bcrypt.compareSync(String(password), user.password_hash);
  if (!ok) return res.status(401).json({ ok: false, error: "Bad login" });

  const token = jwt.sign({ username: user.username, role: user.role }, SECRET, { expiresIn: "7d" });
  res.json({ ok: true, token, role: user.role });
}

function authRequired(req, res, next) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ ok: false, error: "Missing token" });

  try {
    req.user = jwt.verify(m[1], SECRET);
    next();
  } catch {
    res.status(401).json({ ok: false, error: "Bad token" });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ ok: false, error: "Not logged in" });
    if (!roles.includes(req.user.role)) return res.status(403).json({ ok: false, error: "Forbidden" });
    next();
  };
}

module.exports = { loginHandler, authRequired, requireRole };
