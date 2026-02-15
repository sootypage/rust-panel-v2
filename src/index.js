// src/index.js
const path = require("path");
const fs = require("fs");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cors = require("cors");
const http = require("http");
const { Server: IOServer } = require("socket.io");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

require("./db");
const { db } = require("./db");
const { loginHandler, authRequired, requireRole } = require("./auth");
const { listServers, createServerWizard, serverStatus, start, stop, restart, getServerBySlug } = require("./servers");
const { getMetrics } = require("./metrics");

const SECRET = process.env.JWT_SECRET || "CHANGE_ME_SUPER_SECRET";

function tailFile(file, onLine) {
  let lastSize = 0;

  try {
    const data = fs.readFileSync(file, "utf8");
    data.split("\n").slice(-200).forEach(onLine);
    lastSize = fs.statSync(file).size;
  } catch {
    onLine(`[panel] Log not found yet: ${file}`);
    lastSize = 0;
  }

  const watcher = fs.watch(path.dirname(file), { persistent: true }, () => {
    try {
      if (!fs.existsSync(file)) return;
      const stat = fs.statSync(file);
      if (stat.size < lastSize) lastSize = 0;

      const stream = fs.createReadStream(file, { start: lastSize, end: stat.size });
      let buf = "";
      stream.on("data", chunk => {
        buf += chunk.toString("utf8");
        const parts = buf.split("\n");
        buf = parts.pop() || "";
        parts.forEach(onLine);
      });
      stream.on("end", () => { lastSize = stat.size; });
    } catch {}
  });

  return () => watcher.close();
}

const app = express();
const server = http.createServer(app);
const io = new IOServer(server);

app.use(helmet());
app.use(cors());
app.use(rateLimit({ windowMs: 10_000, max: 500 }));
app.use(express.json({ limit: "5mb" }));

app.use(express.static(path.join(process.cwd(), "public")));

// auth
app.post("/api/login", loginHandler);

app.get("/api/me", authRequired, (req, res) => {
  res.json({ ok: true, user: { username: req.user.username, role: req.user.role } });
});

app.post("/api/me/password", authRequired, (req, res) => {
  const { newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 6) {
    return res.status(400).json({ ok:false, error: "Password too short (min 6)" });
  }
  const hash = bcrypt.hashSync(String(newPassword), 12);
  db.prepare("UPDATE users SET password_hash=? WHERE username=?").run(hash, req.user.username);
  res.json({ ok:true });
});

// settings
app.get("/api/settings", authRequired, requireRole("admin"), (req, res) => {
  const rows = db.prepare("SELECT key, value FROM settings").all();
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  res.json({ ok:true, settings: out });
});

app.post("/api/settings", authRequired, requireRole("admin"), (req, res) => {
  const { key, value } = req.body || {};
  if (!key) return res.status(400).json({ ok:false, error:"Missing key" });
  db.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .run(String(key), String(value ?? ""));
  res.json({ ok:true });
});

// servers
app.get("/api/servers", authRequired, async (req, res) => {
  const rows = listServers();
  const out = await Promise.all(rows.map(async s => ({
    slug: s.slug,
    name: s.name,
    modded: !!s.modded,
    running: (await serverStatus(s.slug)).running
  })));
  res.json(out);
});

app.post("/api/servers", authRequired, requireRole("admin","manager"), async (req, res) => {
  try {
    const { slug, name, modded, memoryMiB, maxPlayers, serverPort, rconPort, rconPassword } = req.body || {};
    if (!slug || !name) return res.status(400).json({ ok:false, error:"Missing slug/name" });

    const baseDir = `/srv/rust/${slug}`;
    const rconHost = "127.0.0.1";
    const mp = Number(maxPlayers || 100);
    const sp = Number(serverPort || 28015);
    const rp = Number(rconPort || 28016);
    const mm = memoryMiB ? Number(memoryMiB) : null;

    if (!rconPassword || String(rconPassword).length < 6) {
      return res.status(400).json({ ok:false, error:"rconPassword min 6 chars" });
    }

    const streamId = `${slug}-${Date.now()}`;
    res.json({ ok:true, streamId, baseDir });

    const send = (line) => io.emit("installLine", { streamId, line });

    try {
      await createServerWizard({
        slug,
        name,
        baseDir,
        modded: !!modded,
        memoryMiB: mm,
        maxPlayers: mp,
        serverPort: sp,
        rconHost,
        rconPort: rp,
        rconPassword: String(rconPassword),
        onLine: send
      });
      send("[done] Server created. You can start it now.");
    } catch (e) {
      send(`[error] ${e.message}`);
    }
  } catch (e) {
    res.status(400).json({ ok:false, error: e.message });
  }
});

app.get("/api/servers/:slug/status", authRequired, async (req, res) => {
  try { res.json(await serverStatus(req.params.slug)); }
  catch (e) { res.status(404).json({ ok:false, error:e.message }); }
});

app.post("/api/servers/:slug/start", authRequired, requireRole("admin","manager"), async (req, res) => {
  try { await start(req.params.slug); res.json({ ok:true }); }
  catch (e) { res.status(400).json({ ok:false, error:e.message }); }
});

app.post("/api/servers/:slug/stop", authRequired, requireRole("admin","manager"), async (req, res) => {
  try { await stop(req.params.slug); res.json({ ok:true }); }
  catch (e) { res.status(400).json({ ok:false, error:e.message }); }
});

app.post("/api/servers/:slug/restart", authRequired, requireRole("admin","manager"), async (req, res) => {
  try { await restart(req.params.slug); res.json({ ok:true }); }
  catch (e) { res.status(400).json({ ok:false, error:e.message }); }
});

app.get("/api/servers/:slug/metrics", authRequired, async (req, res) => {
  try { res.json({ ok:true, ...(await getMetrics(req.params.slug)) }); }
  catch (e) { res.status(400).json({ ok:false, error:e.message }); }
});

// socket auth
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Missing token"));
    socket.user = jwt.verify(token, SECRET);
    next();
  } catch {
    next(new Error("Bad token"));
  }
});

io.on("connection", (socket) => {
  let stopTail = null;

  socket.on("joinLogs", ({ slug }) => {
    try {
      if (stopTail) stopTail();
      const s = getServerBySlug(slug);
      if (!s) throw new Error("Server not found");
      const logFile = path.join(s.base_dir, "logs", "console.log");
      stopTail = tailFile(logFile, (line) => socket.emit("logLine", { slug, line }));
      socket.emit("logLine", { slug, line: `[panel] Connected to logs for ${s.name}` });
    } catch (e) {
      socket.emit("logLine", { slug, line: `[panel] ERROR: ${e.message}` });
    }
  });

  socket.on("disconnect", () => { if (stopTail) stopTail(); });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "127.0.0.1", () => {
  console.log(`Panel listening on http://127.0.0.1:${PORT}`);
});
