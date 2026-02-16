require("dotenv").config();
const bcrypt = require("bcrypt");
const { db } = require("./db");

// Auto-create owner user if DB has no users (configured via .env)
(function ensureOwner(){
  const c = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
  if (c > 0) return;
  const u = (process.env.OWNER_USERNAME || "owner").trim();
  const p = (process.env.OWNER_PASSWORD || "change_me_owner_password");
  const hash = bcrypt.hashSync(p, 12);
  db.prepare("INSERT INTO users (username,password_hash,role) VALUES (?,?,?)").run(u, hash, "owner");
  console.log(`[panel] Created initial owner user: ${u}`);
})();


const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const path = require("path");
const api = require("./routes");

const app = express();
app.use(helmet());
app.use(cors({ origin:"*" }));
app.use(rateLimit({ windowMs: 60_000, limit: 500 }));
app.use(express.json({ limit:"2mb" }));

app.use("/api", api);
app.use(express.static(path.join(__dirname,"..","public")));

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 8080);
app.listen(PORT, HOST, ()=>console.log(`[panel-next] http://${HOST}:${PORT}`));
