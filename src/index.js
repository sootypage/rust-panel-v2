const path = require("path");
const fs = require("fs");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cors = require("cors");
const http = require("http");
const { Server: IOServer } = require("socket.io");
const multer = require("multer");
const bcrypt = require("bcrypt");

const { db } = require("./db");
const { loginHandler, authRequired, requireRole } = require("./auth");
const { listServers, createServerWizard, serverStatus, start, stop, restart, getServerBySlug } = require("./servers");
const { getMetrics } = require("./metrics");
const { getPlayers } = require("./rcon");
const { listDir, readFile, writeFile } = require("./files");

// Ensure directories exist
fs.mkdirSync(path.join(process.cwd(), "data", "install-logs"), { recursive: true });
fs.mkdirSync(path.join(process.cwd(), "uploads", "avatars"), { recursive: true });

const app = express();
const server = http.createServer(app);
const io = new IOServer(server, { cors: { origin: "*"} });

app.use(helmet());
app.use(cors());
app.use(rateLimit({ windowMs: 10_000, max: 500 }));
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(process.cwd(), "public")));

// Auth
app.post("/api/login", loginHandler);

app.get("/api/me", authRequired, (req, res) => {
  const u = db.prepare("SELECT username, role, display_name, avatar_path FROM users WHERE username=?")
    .get(req.user.username);
  res.json({ ok: true, user: u });
});

app.post("/api/me/password", authRequired, (req, res) => {
  const { newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 6) {
    return res.status(400).json({ ok: false, error: "Password too short (min 6)" });
  }
  const hash = bcrypt.hashSync(String(newPassword), 12);
  db.prepare("UPDATE users SET password_hash=? WHERE username=?").run(hash, req.user.username);
  res.json({ ok: true });
});

app.post("/api/me/username", authRequired, (req, res) => {
  const { newUsername } = req.body || {};
  if (!newUsername || !/^[a-zA-Z0-9_.-]{3,24}$/.test(newUsername)) {
    return res.status(400).json({ ok: false, error: "Username 3-24 chars (a-zA-Z0-9_.-)" });
  }
  try {
    db.prepare("UPDATE users SET username=? WHERE username=?").run(newUsername, req.user.username);
    res.json({ ok: true });
  } catch {
    res.status(400).json({ ok: false, error: "Username already taken" });
  }
});

const avatarUpload = multer({ dest: path.join(process.cwd(), "uploads", "avatars") });
app.post("/api/me/avatar", authRequired, avatarUpload.single("file"), (req, res) => {
  const ext = path.extname(req.file.originalname).toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
    return res.status(400).json({ ok: false, error: "png/jpg/webp only" });
  }

  const outDir = path.join(process.cwd(), "public", "avatars");
  fs.mkdirSync(outDir, { recursive: true });
  const fileName = `${req.user.username}-${Date.now()}${ext}`;
  const dest = path.join(outDir, fileName);
  fs.renameSync(req.file.path, dest);

  const rel = `/avatars/${fileName}`;
  db.prepare("UPDATE users SET avatar_path=? WHERE username=?").run(rel, req.user.username);
  res.json({ ok: true, avatar: rel });
});

// Servers list
app.get("/api/servers", authRequired, async (req, res) => {
  const rows = listServers();
  const out = await Promise.all(
    rows.map(async (s) => {
      const st = await serverStatus(s.slug).catch(() => ({ running: false }));
      const publicEndpoint =
        (s.public_ip && s.public_port) ? `${s.public_ip}:${s.public_port}` : null;

      return {
        slug: s.slug,
        name: s.name,
        modded: !!s.modded,
        running: !!st.running,
        serverPort: s.server_port,
        queryPort: s.query_port,
        publicEndpoint
      };
    })
  );
  res.json({ ok: true, servers: out });
});

// Create server (streams install logs via socket.io)
app.post("/api/servers", authRequired, requireRole("admin", "manager"), async (req, res) => {
  const {
    slug, name, modded, memoryMiB, maxPlayers,
    serverPort, queryPort,
    rconPort, rconPassword,
    worldsize, seed,
    publicIp, publicPort
  } = req.body || {};

  if (!slug || !name) return res.status(400).json({ ok: false, error: "Missing slug/name" });

  const baseDir = `/srv/rust/${slug}`;
  const streamId = `${slug}-${Date.now()}`;
  res.json({ ok: true, streamId, baseDir });

  const send = (line) => io.emit("installLine", { streamId, line });

  try {
    await createServerWizard({
      slug,
      name,
      baseDir,
      modded: !!modded,
      memoryMiB: memoryMiB ? Number(memoryMiB) : null,
      maxPlayers: Number(maxPlayers || 100),
      serverPort: Number(serverPort || 28015),
      queryPort: (queryPort === null || queryPort === "" || typeof queryPort === "undefined") ? null : Number(queryPort),
      rconHost: "127.0.0.1",
      rconPort: Number(rconPort || 28016),
      rconPassword: String(rconPassword || ""),
      worldsize: Number(worldsize || 3500),
      seed: (seed === null || seed === "" || typeof seed === "undefined") ? null : Number(seed),
      publicIp: publicIp ? String(publicIp) : null,
      publicPort: publicPort ? Number(publicPort) : null,
      onLine: send
    });

    send("[done] Server created. You can start it now.");
  } catch (e) {
    send(`[error] ${e.message}`);
  }
});

app.get("/api/servers/:slug/info", authRequired, (req, res) => {
  const s = db.prepare(`
    SELECT slug,name,modded,max_players,server_port,query_port,worldsize,seed,public_ip,public_port
    FROM servers WHERE slug=?
  `).get(req.params.slug);

  if (!s) return res.status(404).json({ ok: false, error: "Not found" });
  res.json({ ok: true, server: s });
});

app.get("/api/servers/:slug/players", authRequired, async (req, res) => {
  try { res.json({ ok: true, ...(await getPlayers(req.params.slug)) }); }
  catch (e) { res.json({ ok: false, error: e.message, players: null }); }
});

app.get("/api/servers/:slug/metrics", authRequired, async (req, res) => {
  try { res.json({ ok: true, ...(await getMetrics(req.params.slug)) }); }
  catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});

app.post("/api/servers/:slug/start", authRequired, requireRole("admin", "manager"), async (req, res) => {
  await start(req.params.slug);
  res.json({ ok: true });
});
app.post("/api/servers/:slug/stop", authRequired, requireRole("admin", "manager"), async (req, res) => {
  await stop(req.params.slug);
  res.json({ ok: true });
});
app.post("/api/servers/:slug/restart", authRequired, requireRole("admin", "manager"), async (req, res) => {
  await restart(req.params.slug);
  res.json({ ok: true });
});

// File Manager
app.get("/api/servers/:slug/files", authRequired, requireRole("admin", "manager"), (req, res) => {
  const s = getServerBySlug(req.params.slug);
  if (!s) return res.status(404).json({ ok: false, error: "Server not found" });
  try { res.json({ ok: true, ...listDir(s.base_dir, String(req.query.path || "")) }); }
  catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});

app.get("/api/servers/:slug/file", authRequired, requireRole("admin", "manager"), (req, res) => {
  const s = getServerBySlug(req.params.slug);
  if (!s) return res.status(404).json({ ok: false, error: "Server not found" });
  try { res.json({ ok: true, content: readFile(s.base_dir, String(req.query.path || "")) }); }
  catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});

app.post("/api/servers/:slug/file", authRequired, requireRole("admin", "manager"), (req, res) => {
  const s = getServerBySlug(req.params.slug);
  if (!s) return res.status(404).json({ ok: false, error: "Server not found" });
  try {
    const { path: rel, content } = req.body || {};
    if (!rel) return res.status(400).json({ ok: false, error: "Missing path" });
    writeFile(s.base_dir, String(rel), String(content ?? ""));
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// Socket.io ping
io.on("connection", (socket) => {
  socket.emit("hello", { ok: true });
});

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";
server.listen(PORT, HOST, () => {
  console.log(`[panel] Listening on http://${HOST}:${PORT}`);
});
