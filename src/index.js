const path = require("path");
const fs = require("fs");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cors = require("cors");
const http = require("http");
const { Server: IOServer } = require("socket.io");
const multer = require("multer");

require("./db"); // ensure tables exist

const { loginHandler, authRequired, requireRole } = require("./auth");
const { listServers, createServer, serverStatus, start, stop, restart, getServerBySlug } = require("./servers");
const { listDir, readFile, writeFile } = require("./files");
const { createBackup } = require("./backups");
const { listPlugins, movePlugin, ensureDirs } = require("./plugins");
const { getMetrics } = require("./metrics");

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

  const watcher = fs.watch(file, { persistent: true }, () => {
    fs.stat(file, (err, stat) => {
      if (err) return;
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
    });
  });

  return () => watcher.close();
}

const app = express();
const server = http.createServer(app);
const io = new IOServer(server);

app.use(helmet());
app.use(cors());
app.use(rateLimit({ windowMs: 10_000, max: 300 }));
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(process.cwd(), "public")));

const upload = multer({ dest: path.join(process.cwd(), "uploads") });

app.post("/api/login", loginHandler);

app.get("/api/servers", authRequired, async (req, res) => {
  const rows = listServers();
  const out = await Promise.all(rows.map(async s => ({
    slug: s.slug,
    name: s.name,
    running: (await serverStatus(s.slug)).running
  })));
  res.json(out);
});

app.post("/api/servers", authRequired, requireRole("admin","manager"), async (req, res) => {
  try {
    const { slug, name, baseDir, startCmd, rcon } = req.body || {};
    if (!slug || !name || !baseDir || !startCmd) return res.status(400).json({ ok:false, error:"Missing fields" });

    if (!String(baseDir).startsWith("/srv/rust/")) {
      return res.status(400).json({ ok:false, error:"baseDir must be under /srv/rust/<slug>" });
    }

    fs.mkdirSync(baseDir, { recursive: true });

    const created = await createServer({ slug, name, baseDir, startCmd, rcon });
    res.json({ ok:true, server: { slug: created.slug, name: created.name } });
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

app.get("/api/servers/:slug/files", authRequired, requireRole("admin","manager","viewer"), (req, res) => {
  try { res.json({ ok:true, ...listDir(req.params.slug, req.query.path || ".") }); }
  catch (e) { res.status(400).json({ ok:false, error:e.message }); }
});
app.get("/api/servers/:slug/file", authRequired, requireRole("admin","manager"), (req, res) => {
  try { res.json({ ok:true, content: readFile(req.params.slug, req.query.path) }); }
  catch (e) { res.status(400).json({ ok:false, error:e.message }); }
});
app.post("/api/servers/:slug/file", authRequired, requireRole("admin","manager"), (req, res) => {
  try { writeFile(req.params.slug, req.body.path, req.body.content); res.json({ ok:true }); }
  catch (e) { res.status(400).json({ ok:false, error:e.message }); }
});

app.post("/api/servers/:slug/backup", authRequired, requireRole("admin","manager"), async (req, res) => {
  try { const b = await createBackup(req.params.slug); res.json({ ok:true, backup: { file: b.file } }); }
  catch (e) { res.status(400).json({ ok:false, error:e.message }); }
});
app.get("/api/backups/:file", authRequired, requireRole("admin","manager"), (req, res) => {
  const f = path.join(process.cwd(), "backups", path.basename(req.params.file));
  if (!fs.existsSync(f)) return res.status(404).end();
  res.download(f);
});

app.get("/api/servers/:slug/plugins", authRequired, requireRole("admin","manager","viewer"), (req, res) => {
  try { res.json({ ok:true, ...listPlugins(req.params.slug) }); }
  catch (e) { res.status(400).json({ ok:false, error:e.message }); }
});
app.post("/api/servers/:slug/plugins/upload", authRequired, requireRole("admin","manager"), upload.single("file"), (req, res) => {
  try {
    const s = getServerBySlug(req.params.slug);
    if (!s) return res.status(404).json({ ok:false, error:"Server not found" });
    const { pluginsDir } = ensureDirs(s.base_dir);

    const original = req.file.originalname;
    if (!original.endsWith(".cs")) return res.status(400).json({ ok:false, error:"Only .cs plugins supported" });

    const dest = path.join(pluginsDir, path.basename(original));
    fs.renameSync(req.file.path, dest);
    res.json({ ok:true });
  } catch (e) {
    res.status(400).json({ ok:false, error:e.message });
  }
});
app.post("/api/servers/:slug/plugins/toggle", authRequired, requireRole("admin","manager"), (req, res) => {
  try {
    const { name, enable } = req.body || {};
    movePlugin(req.params.slug, name, !!enable);
    res.json({ ok:true });
  } catch (e) { res.status(400).json({ ok:false, error:e.message }); }
});

// Socket.IO (logs)
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Missing token"));
    const jwt = require("jsonwebtoken");
    const secret = process.env.JWT_SECRET || "CHANGE_ME_SUPER_SECRET";
    socket.user = jwt.verify(token, secret);
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
  console.log(`Panel listening on http://127.0.0.1:${PORT} (put Nginx in front for HTTPS)`);
});
