const path = require("path");
const fs = require("fs");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cors = require("cors");
const http = require("http");
const { Server: IOServer } = require("socket.io");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const { db } = require("./db");
const { loginHandler, authRequired, requireRole } = require("./auth");
const { listServers, createServerWizard, serverStatus, start, stop, restart, getServerBySlug } = require("./servers");
const { getMetrics } = require("./metrics");
const { getPlayers } = require("./rcon");
const { listDir, readFile, writeFile } = require("./files");

const SECRET = process.env.JWT_SECRET || "CHANGE_ME_SUPER_SECRET";

const app = express();
const server = http.createServer(app);
const io = new IOServer(server);

app.use(helmet());
app.use(cors());
app.use(rateLimit({ windowMs: 10_000, max: 500 }));
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(process.cwd(), "public")));

// Auth
app.post("/api/login", loginHandler);
app.get("/api/me", authRequired, (req, res) => {
  const u = db.prepare("SELECT username, role, display_name, avatar_path FROM users WHERE username=?").get(req.user.username);
  res.json({ ok: true, user: u });
});

app.post("/api/me/password", authRequired, (req, res) => {
  const { newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 6) return res.status(400).json({ ok:false, error:"Password too short (min 6)" });
  const hash = bcrypt.hashSync(String(newPassword), 12);
  db.prepare("UPDATE users SET password_hash=? WHERE username=?").run(hash, req.user.username);
  res.json({ ok:true });
});

app.post("/api/me/username", authRequired, (req, res) => {
  const { newUsername } = req.body || {};
  if (!newUsername || !/^[a-zA-Z0-9_.-]{3,24}$/.test(newUsername)) return res.status(400).json({ ok:false, error:"Username 3-24 chars (a-zA-Z0-9_.-)" });
  try {
    db.prepare("UPDATE users SET username=? WHERE username=?").run(newUsername, req.user.username);
    res.json({ ok:true });
  } catch {
    res.status(400).json({ ok:false, error:"Username already taken" });
  }
});

const avatarUpload = multer({ dest: path.join(process.cwd(), "uploads", "avatars") });
app.post("/api/me/avatar", authRequired, avatarUpload.single("file"), (req, res) => {
  const ext = path.extname(req.file.originalname).toLowerCase();
  if (![".png",".jpg",".jpeg",".webp"].includes(ext)) return res.status(400).json({ ok:false, error:"png/jpg/webp only" });

  const outDir = path.join(process.cwd(), "public", "avatars");
  fs.mkdirSync(outDir, { recursive: true });
  const fileName = `${req.user.username}-${Date.now()}${ext}`;
  const dest = path.join(outDir, fileName);
  fs.renameSync(req.file.path, dest);

  const rel = `/avatars/${fileName}`;
  db.prepare("UPDATE users SET avatar_path=? WHERE username=?").run(rel, req.user.username);
  res.json({ ok:true, avatar: rel });
});

// Settings + Discord webhook storage (per server)
app.post("/api/webhooks/discord", authRequired, requireRole("admin"), (req, res) => {
  const { slug, webhookUrl } = req.body || {};
  if (!slug || !webhookUrl) return res.status(400).json({ ok:false, error:"Missing slug/webhookUrl" });
  db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .run(`discord_webhook_${slug}`, String(webhookUrl));
  res.json({ ok:true });
});

async function postDiscord(slug) {
  const hook = db.prepare("SELECT value FROM settings WHERE key=?").get(`discord_webhook_${slug}`)?.value;
  if (!hook) return;

  const info = db.prepare("SELECT * FROM servers WHERE slug=?").get(slug);
  if (!info) return;

  const m = await getMetrics(slug).catch(() => ({}));
  const p = await getPlayers(slug).catch(() => ({ players: null }));

  const endpoint =
    (info.playit_enabled && info.playit_endpoint) ? info.playit_endpoint :
    (info.public_ip && info.public_port) ? `${info.public_ip}:${info.public_port}` :
    `127.0.0.1:${info.server_port}`;

  const payload = {
    embeds: [{
      title: `Rust Server Stats: ${info.name}`,
      description: `**Connect:** \`${endpoint}\``,
      fields: [
        { name: "Players", value: String(p.players ?? "N/A"), inline: true },
        { name: "CPU %", value: String(m.cpu?.toFixed?.(2) ?? "N/A"), inline: true },
        { name: "RAM", value: m.memoryBytes ? `${Math.round(m.memoryBytes/1024/1024)} MiB` : "N/A", inline: true }
      ]
    }]
  };

  await fetch(hook, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(payload) });
}

setInterval(async () => {
  const slugs = db.prepare("SELECT slug FROM servers").all().map(r => r.slug);
  for (const slug of slugs) { try { await postDiscord(slug); } catch {} }
}, 60_000);

// Servers list
app.get("/api/servers", authRequired, async (req, res) => {
  const rows = listServers();
  const out = await Promise.all(rows.map(async s => ({
    slug: s.slug,
    name: s.name,
    modded: !!s.modded,
    running: (await serverStatus(s.slug)).running,
    endpoint: (s.playit_enabled && s.playit_endpoint) ? s.playit_endpoint :
      (s.public_ip && s.public_port) ? `${s.public_ip}:${s.public_port}` :
      null
  })));
  res.json(out);
});

// Create server (streams install logs via socket.io)
app.post("/api/servers", authRequired, requireRole("admin","manager"), async (req, res) => {
  try {
    const {
      slug, name, modded, memoryMiB, maxPlayers,
      serverPort, rconPort, rconPassword,
      worldsize, seed,
      publicIp, publicPort,
      useVps, vpsIp, queryPort,
      playitEnabled, playitEndpoint, playitToken
    } = req.body || {};

    if (!slug || !name) return res.status(400).json({ ok:false, error:"Missing slug/name" });

    const baseDir = `/srv/rust/${slug}`;
    const streamId = `${slug}-${Date.now()}`;
    res.json({ ok:true, streamId, baseDir });

    const send = (line) => io.emit("installLine", { streamId, line });

    await createServerWizard({
      slug,
      name,
      baseDir,
      modded: !!modded,
      memoryMiB: memoryMiB ? Number(memoryMiB) : null,
      maxPlayers: Number(maxPlayers || 100),
      serverPort: Number(serverPort || 28015),
      rconHost: "127.0.0.1",
      rconPort: Number(rconPort || 28016),
      rconPassword: String(rconPassword || ""),
      worldsize: Number(worldsize || 3500),
      seed: (seed === null || seed === "" || typeof seed === "undefined") ? null : Number(seed),
      publicIp: (vpsIp ? String(vpsIp) : (publicIp ? String(publicIp) : null)),
      publicPort: publicPort ? Number(publicPort) : null,
      useVps: !!useVps,
      vpsIp: vpsIp ? String(vpsIp) : null,
      queryPort: (queryPort === null || queryPort === "" || typeof queryPort === "undefined") ? null : Number(queryPort),
      playitEnabled: !!playitEnabled,
      playitEndpoint: playitEndpoint ? String(playitEndpoint) : null,
      playitToken: playitToken ? String(playitToken) : null,
      onLine: send
    });

    send("[done] Server created. You can start it now.");
  } catch (e) {
    io.emit("installLine", { streamId: "unknown", line: `[error] ${e.message}` });
  }
});

app.get("/api/servers/:slug/info", authRequired, (req, res) => {
  const s = db.prepare(`
    SELECT slug,name,modded,max_players,server_port,worldsize,seed,
           public_ip,public_port,use_vps,vps_ip,query_port,playit_enabled,playit_endpoint
    FROM servers WHERE slug=?
  `).get(req.params.slug);
  if (!s) return res.status(404).json({ ok:false, error:"Not found" });
  res.json({ ok:true, server:s });
});

app.get("/api/servers/:slug/players", authRequired, async (req, res) => {
  try { res.json({ ok:true, ...(await getPlayers(req.params.slug)) }); }
  catch (e) { res.json({ ok:false, error:e.message, players:null }); }
});

app.get("/api/servers/:slug/metrics", authRequired, async (req, res) => {
  try { res.json({ ok:true, ...(await getMetrics(req.params.slug)) }); }
  catch (e) { res.status(400).json({ ok:false, error:e.message }); }
});

app.post("/api/servers/:slug/start", authRequired, requireRole("admin","manager"), async (req, res) => { await start(req.params.slug); res.json({ ok:true }); });
app.post("/api/servers/:slug/stop", authRequired, requireRole("admin","manager"), async (req, res) => { await stop(req.params.slug); res.json({ ok:true }); });
app.post("/api/servers/:slug/restart", authRequired, requireRole("admin","manager"), async (req, res) => { await restart(req.params.slug); res.json({ ok:true }); });

// File Manager routes
app.get("/api/servers/:slug/files", authRequired, requireRole("admin","manager"), (req, res) => {
  const s = getServerBySlug(req.params.slug);
  if (!s) return res.status(404).json({ ok:false, error:"Server not found" });
  try { res.json({ ok:true, ...listDir(s.base_dir, String(req.query.path || "")) }); }
  catch (e) { res.status(400).json({ ok:false, error:e.message }); }
});

app.get("/api/servers/:slug/file", authRequired, requireRole("admin","manager"), (req, res) => {
  const s = getServerBySlug(req.params.slug);
  if (!s) return res.status(404).json({ ok:false, error:"Server not found" });
  try { res.json({ ok:true, content: readFile(s.base_dir, String(req.query.path || "")) }); }
  catch (e) { res.status(400).json({ ok:false, error:e.message }); }
});

app.post("/api/servers/:slug/file", authRequired, requireRole("admin","manager"), (req, res) => {
  const s = getServerBySlug(req.params.slug);
  if (!s) return res.status(404).json({ ok:false, error:"Server not found" });
  try {
    const { path: rel, content } = req.body || {};
    if (!rel) return res.status(400).json({ ok:false, error:"Missing path" });
    writeFile(s.base_dir, String(rel), String(content ?? ""));
    res.json({ ok:true });
  } catch (e) { res.status(400).json({ ok:false, error:e.message }); }
});

// Plugin upload (.cs)
const upload = multer({ dest: path.join(process.cwd(), "uploads") });
app.post("/api/servers/:slug/plugins/upload", authRequired, requireRole("admin","manager"), upload.single("file"), (req, res) => {
  const s = getServerBySlug(req.params.slug);
  if (!s) return res.status(404).json({ ok:false, error:"Server not found" });

  const original = req.file.originalname || "";
  if (!original.endsWith(".cs")) return res.status(400).json({ ok:false, error:"Only .cs plugins supported" });

  const destDir = path.join(s.base_dir, "oxide", "plugins");
  fs.mkdirSync(destDir, { recursive: true });
  fs.renameSync(req.file.path, path.join(destDir, original));
  res.json({ ok:true, savedAs: original });
});

// sockets: auth + log tail
function tailFile(file, onLine) {
  let lastSize = 0;
  try {
    const data = fs.readFileSync(file, "utf8");
    data.split("\n").slice(-200).forEach(onLine);
    lastSize = fs.statSync(file).size;
  } catch { onLine(`[panel] Log not found yet: ${file}`); lastSize = 0; }

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

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Missing token"));
    socket.user = jwt.verify(token, SECRET);
    next();
  } catch { next(new Error("Bad token")); }
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
server.listen(PORT, "127.0.0.1", () => console.log(`Panel listening on http://127.0.0.1:${PORT}`));
