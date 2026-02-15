const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { db } = require("./db");

const JWT_SECRET = process.env.JWT_SECRET || "CHANGE_ME_SUPER_SECRET";
const TOKEN_TTL = "12h";

function signUser(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

function authRequired(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: "Missing token" });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ ok: false, error: "Invalid token" });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ ok: false, error: "Not logged in" });
    if (!roles.includes(req.user.role)) return res.status(403).json({ ok: false, error: "Forbidden" });
    next();
  };
}

function loginHandler(req, res) {
  const { username, password } = req.body || {};
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!user) return res.status(401).json({ ok: false, error: "Bad login" });

  const ok = bcrypt.compareSync(String(password || ""), user.password_hash);
  if (!ok) return res.status(401).json({ ok: false, error: "Bad login" });

  const token = signUser(user);
  res.json({ ok: true, token, role: user.role, username: user.username });
}

module.exports = { authRequired, requireRole, loginHandler };
