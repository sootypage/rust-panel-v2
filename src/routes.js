const express = require("express");
const bcrypt = require("bcrypt");
const path = require("path");
const { spawn } = require("child_process");
const pidusage = require("pidusage");

const { db } = require("./db");
const { sign, requireAuth, requireRole } = require("./auth");
const { installRust, installUMod, installPaper } = require("./installer");
const { createService, start, stop, restart, unitName, mainPid, SYSTEMD_MODE } = require("./systemd");
const { sendRcon } = require("./rcon");
const { createInstallStream, getInstallStream, appendLine, markDone } = require("./install_streams");

// Root directory for game servers.
// Default is user-writable to avoid needing sudo for normal installs.
const GAME_ROOT =
  process.env.GAME_ROOT ||
  process.env.RUST_ROOT || // backwards-compat
  (process.env.HOME ? path.join(process.env.HOME, "game-servers") : "/srv/games");
const router = express.Router();

router.get("/health", (_q,res)=>res.json({ok:true}));

// Owner user is created from .env on first start. (No web bootstrap endpoint.)

router.post("/auth/login", (req,res)=>{
  const { username, password } = req.body||{};
  const u = db.prepare("SELECT * FROM users WHERE username=?").get(username);
  if(!u) return res.status(401).json({ok:false,error:"Invalid login"});
  if(!bcrypt.compareSync(password||"", u.password_hash)) return res.status(401).json({ok:false,error:"Invalid login"});
  res.json({ok:true, token: sign(u), user:{id:u.id,username:u.username,role:u.role}});
});

router.get("/users", requireAuth, requireRole(["owner","admin"]), (req,res)=>{
  const users = db.prepare("SELECT id, username, role, created_at FROM users ORDER BY created_at DESC").all();
  res.json({ok:true, users});
});

router.post("/users", requireAuth, requireRole(["owner","admin"]), (req,res)=>{
  const { username, password, role } = req.body||{};
  const u = String(username||"").trim();
  const p = String(password||"");
  const r = String(role||"user").trim();
  if(!u || !p) return res.status(400).json({ok:false,error:"username/password required"});
  if(!/^[a-zA-Z0-9_.-]{2,32}$/.test(u)) return res.status(400).json({ok:false,error:"Invalid username"});
  if(!["user","admin","owner"].includes(r)) return res.status(400).json({ok:false,error:"Invalid role"});
  const hash = bcrypt.hashSync(p,12);
  try{
    db.prepare("INSERT INTO users (username,password_hash,role) VALUES (?,?,?)").run(u,hash,r);
  }catch(e){
    if(String(e.message||e).includes("UNIQUE")) return res.status(400).json({ok:false,error:"Username already exists"});
    throw e;
  }
  res.json({ok:true});
});

router.get("/me", requireAuth, (req,res)=>res.json({ok:true,user:req.user}));


router.get("/install/:id/log", requireAuth, (req,res)=>{
  const id = req.params.id;
  const s = getInstallStream(id);
  if(!s) return res.status(404).json({ok:false,error:"Not found"});
  if(!(req.user.role==="owner"||req.user.role==="admin"||s.owner_user_id===req.user.id)) return res.status(403).json({ok:false,error:"Forbidden"});
  try{
    const fs = require("fs");
    const p = s.logPath;
    if(!p || !fs.existsSync(p)) return res.status(404).json({ok:false,error:"Log file not found"});
    res.setHeader("Content-Type","text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${id}.log"`);
    res.send(fs.readFileSync(p,"utf8"));
  }catch(e){
    res.status(500).json({ok:false,error:String(e.message||e)});
  }
});

router.get("/servers", requireAuth, (req,res)=>{
  let rows;
  if (req.user.role==="owner"||req.user.role==="admin"){
    rows = db.prepare("SELECT * FROM servers ORDER BY created_at DESC").all();
  } else {
    rows = db.prepare(`
      SELECT s.* FROM servers s
      LEFT JOIN server_users su ON su.server_id = s.id AND su.user_id = ?
      WHERE s.owner_user_id = ? OR su.user_id = ?
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `).all(req.user.id, req.user.id, req.user.id);
  }
  res.json({ok:true, servers: rows.map(s=>({
    ...s,
    service_name: unitName(s.slug),
    rcon_password: undefined,
    import_code: (req.user.role==="owner"||req.user.role==="admin"||s.owner_user_id===req.user.id) ? s.import_code : undefined
  }))});
});

router.post("/servers", requireAuth, requireRole(["owner","admin"]), async (req,res)=>{
  try{
    const b=req.body||{};
    const slug=String(b.slug||"").trim();
    if(!slug||!/^[a-zA-Z0-9_-]{1,32}$/.test(slug)) return res.status(400).json({ok:false,error:"Invalid slug"});
    const game = String(b.game || "rust").toLowerCase();
    if(!["rust","minecraft"].includes(game)) return res.status(400).json({ok:false,error:"Invalid game"});

    const base_dir = path.join(GAME_ROOT, slug);
    const import_code = (Math.random().toString(36).slice(2,8)).toUpperCase();
    const row={
      slug,
      name: String(b.name||slug).trim(),
      game,
      base_dir,
      server_port: Number(b.server_port|| (game==="minecraft"?25565:28015)),
      query_port: Number(b.query_port||28017),
      rcon_host: String(b.rcon_host||"127.0.0.1"),
      rcon_port: Number(b.rcon_port||28016),
      rcon_password: String(b.rcon_password||""),
      ram_mb: Number(b.ram_mb||4096),
      mc_version: b.mc_version ? String(b.mc_version) : null,
      jar_name: b.jar_name ? String(b.jar_name) : null,
      maxplayers: Number(b.maxplayers|| (game==="minecraft"?20:50)),
      worldsize: Number(b.worldsize||3500),
      seed: Number(b.seed||0),
      level: String(b.level|| (game==="minecraft"?"world":"Procedural Map")),
      modded: b.modded?1:0,
      owner_user_id: req.user.id,
      import_code
    };
    db.prepare(`INSERT INTO servers
      (slug,name,game,base_dir,server_port,query_port,rcon_host,rcon_port,rcon_password,ram_mb,mc_version,jar_name,maxplayers,worldsize,seed,level,modded,owner_user_id,import_code)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      row.slug,row.name,row.game,row.base_dir,row.server_port,row.query_port,row.rcon_host,row.rcon_port,row.rcon_password,
      row.ram_mb,row.mc_version,row.jar_name,row.maxplayers,row.worldsize,row.seed,row.level,row.modded,row.owner_user_id,row.import_code
    );

    // ensure creator can see server via membership table too
    const sid = db.prepare("SELECT id FROM servers WHERE slug=?").get(row.slug).id;
    db.prepare("INSERT OR IGNORE INTO server_users (server_id,user_id,role) VALUES (?,?,?)").run(sid, req.user.id, "owner");

    // Stream install output back to the UI via SSE
    const installId = `${slug}-${Date.now()}`;
    createInstallStream(installId);

    (async ()=>{
      try{
        appendLine(installId, `[panel] Installing to ${base_dir}`);
        if(row.game === "rust"){
          await installRust({ baseDir: base_dir, modded: !!row.modded, onLine: (l)=>appendLine(installId, l) });
        } else {
          await installPaper({
            baseDir: base_dir,
            version: row.mc_version,
            jarName: row.jar_name,
            ramMb: row.ram_mb,
            maxPlayers: row.maxplayers,
            port: row.server_port,
            onLine: (l)=>appendLine(installId, l)
          });
        }
        appendLine(installId, `[panel] Creating systemd service`);
        await createService(row, { onLine: (l)=>appendLine(installId, l) });
        appendLine(installId, `[panel] Done ✅`);
        markDone(installId, true, { slug: row.slug, import_code: row.import_code });
      }catch(e){
        appendLine(installId, `[error] ${String(e?.message||e)}`);
        markDone(installId, false, { slug: row.slug });
      }
    })();

    res.json({ok:true, slug: row.slug, import_code: row.import_code, installId});
  }catch(e){
    const msg = String(e?.message||e);
    if (msg.includes("UNIQUE constraint failed")) return res.status(400).json({ok:false,error:"Slug already exists"});
    res.status(500).json({ok:false,error:msg});
  }
});

// Server-sent-events stream for install logs
router.get("/install/:id", requireAuth, (req,res)=>{
  const id = String(req.params.id||"");
  const s = getInstallStream(id);
  if (!s) return res.status(404).json({ok:false,error:"Install stream not found"});

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const onLine = (line) => send("line", { line });
  const onDone = (payload) => { send("done", payload); res.end(); };

  send("hello", { ok:true, id });
  s.emitter.on("line", onLine);
  s.emitter.once("done", onDone);

  req.on("close", ()=>{
    s.emitter.off("line", onLine);
    s.emitter.off("done", onDone);
  });
});

router.post("/servers/import", requireAuth, (req,res)=>{
  const code = String(req.body?.code||"").trim();
  if(!code) return res.status(400).json({ok:false,error:"code required"});
  const s = db.prepare("SELECT id, slug FROM servers WHERE import_code=?").get(code);
  if(!s) return res.status(404).json({ok:false,error:"Invalid code"});
  db.prepare("INSERT OR IGNORE INTO server_users (server_id,user_id,role) VALUES (?,?,?)").run(s.id, req.user.id, "member");
  res.json({ok:true, slug:s.slug});
});

router.get("/servers/:slug", requireAuth, (req,res)=>{
  const s=db.prepare("SELECT * FROM servers WHERE slug=?").get(req.params.slug);
  if(!s) return res.status(404).json({ok:false,error:"Not found"});
  if(!(req.user.role==="owner"||req.user.role==="admin"||s.owner_user_id===req.user.id)) return res.status(403).json({ok:false,error:"Forbidden"});
  res.json({ok:true,server:{...s, service_name: unitName(s.slug), rcon_password: undefined}});
});

router.post("/servers/:slug/start", requireAuth, async (req,res)=>{ try{ await start(req.params.slug); res.json({ok:true}); }catch(e){ res.status(500).json({ok:false,error:String(e.message||e)}); } });
router.post("/servers/:slug/stop", requireAuth, async (req,res)=>{ try{ await stop(req.params.slug); res.json({ok:true}); }catch(e){ res.status(500).json({ok:false,error:String(e.message||e)}); } });
router.post("/servers/:slug/restart", requireAuth, async (req,res)=>{ try{ await restart(req.params.slug); res.json({ok:true}); }catch(e){ res.status(500).json({ok:false,error:String(e.message||e)}); } });

router.get("/servers/:slug/metrics", requireAuth, async (req,res)=>{
  const slug=req.params.slug;
  const s=db.prepare("SELECT * FROM servers WHERE slug=?").get(slug);
  if(!s) return res.status(404).json({ok:false,error:"Not found"});
  if(!(req.user.role==="owner"||req.user.role==="admin"||s.owner_user_id===req.user.id)) return res.status(403).json({ok:false,error:"Forbidden"});
  const pid = await mainPid(slug);
  if (!pid) return res.json({ok:true,running:false,pid:0,cpu:0,memoryBytes:0});
  const stat = await pidusage(pid);
  res.json({ok:true,running:true,pid, cpu: stat.cpu, memoryBytes: stat.memory});
});

router.post("/servers/:slug/rcon", requireAuth, async (req,res)=>{
  const slug=req.params.slug;
  const s=db.prepare("SELECT * FROM servers WHERE slug=?").get(slug);
  if(!s) return res.status(404).json({ok:false,error:"Not found"});
  if(!(req.user.role==="owner"||req.user.role==="admin"||s.owner_user_id===req.user.id)) return res.status(403).json({ok:false,error:"Forbidden"});
  const cmd = String((req.body||{}).command||"").trim();
  if(!cmd) return res.status(400).json({ok:false,error:"command required"});
  try{
    const out = await sendRcon({ host:s.rcon_host, port:s.rcon_port, password:s.rcon_password, command:cmd });
    res.json({ok:true, output: out});
  }catch(e){
    res.status(500).json({ok:false,error:String(e.message||e)});
  }
});

router.get("/servers/:slug/logs", requireAuth, (req,res)=>{
  const slug=req.params.slug;
  const s=db.prepare("SELECT * FROM servers WHERE slug=?").get(slug);
  if(!s) return res.status(404).end();
  if(!(req.user.role==="owner"||req.user.role==="admin"||s.owner_user_id===req.user.id)) return res.status(403).end();

  res.writeHead(200, {
    "Content-Type":"text/event-stream",
    "Cache-Control":"no-cache",
    "Connection":"keep-alive"
  });
  res.write("event: hello\ndata: connected\n\n");

  // Logs: root mode uses system journal; user mode uses --user-unit.
  const args = (SYSTEMD_MODE === "root")
    ? ["-n","journalctl","-u", unitName(slug), "-n", "200", "-f", "--no-pager"]
    : ["--user", "-u", unitName(slug), "-n", "200", "-f", "--no-pager"];
  const p = (SYSTEMD_MODE === "root")
    ? spawn("sudo", args)
    : spawn("journalctl", args);
  const sendLine = (line)=>res.write(`data: ${line.replace(/\r/g,"")}\n\n`);
  p.stdout.on("data",(b)=>b.toString("utf8").split("\n").filter(Boolean).forEach(sendLine));
  p.stderr.on("data",(b)=>b.toString("utf8").split("\n").filter(Boolean).forEach(l=>sendLine("[err] "+l)));

  req.on("close", ()=>{ try{ p.kill("SIGKILL"); }catch{} });
});


router.get("/servers/:slug/importcode", requireAuth, (req,res)=>{
  const s=db.prepare("SELECT * FROM servers WHERE slug=?").get(req.params.slug);
  if(!s) return res.status(404).json({ok:false,error:"Not found"});
  if(!(req.user.role==="owner"||req.user.role==="admin"||s.owner_user_id===req.user.id)) return res.status(403).json({ok:false,error:"Forbidden"});
  res.json({ok:true, import_code: s.import_code || null});
});

router.post("/servers/:slug/importcode/regenerate", requireAuth, (req,res)=>{
  const s=db.prepare("SELECT * FROM servers WHERE slug=?").get(req.params.slug);
  if(!s) return res.status(404).json({ok:false,error:"Not found"});
  if(!(req.user.role==="owner"||req.user.role==="admin"||s.owner_user_id===req.user.id)) return res.status(403).json({ok:false,error:"Forbidden"});
  const code=(Math.random().toString(36).slice(2,8)).toUpperCase();
  db.prepare("UPDATE servers SET import_code=? WHERE id=?").run(code, s.id);
  res.json({ok:true, import_code: code});
});

// --- File manager (safe, scoped to server base_dir) ---
const fs = require("fs");
const fsp = fs.promises;

function safeJoin(base, rel){
  const clean = String(rel||"").replace(/^\/+/, "");
  const full = path.resolve(base, clean);
  const baseResolved = path.resolve(base);
  if(!full.startsWith(baseResolved + path.sep) && full !== baseResolved){
    throw new Error("Invalid path");
  }
  return full;
}

function canAccessServer(user, s){
  if (user.role === "owner" || user.role === "admin") return true;
  if (s.owner_user_id === user.id) return true;
  const link = db.prepare("SELECT 1 FROM server_users WHERE server_id=? AND user_id=?").get(s.id, user.id);
  return !!link;
}

router.get("/servers/:slug/files/list", requireAuth, async (req,res)=>{
  try{
    const s=db.prepare("SELECT * FROM servers WHERE slug=?").get(req.params.slug);
    if(!s) return res.status(404).json({ok:false,error:"Not found"});
    if(!canAccessServer(req.user, s)) return res.status(403).json({ok:false,error:"Forbidden"});
    const rel=req.query.path||"";
    const dir=safeJoin(s.base_dir, rel);
    const entries=await fsp.readdir(dir, { withFileTypes:true });
    const out=[];
    for(const e of entries){
      const p=path.join(dir, e.name);
      const st=await fsp.stat(p);
      out.push({ name:e.name, type: e.isDirectory()?"dir":"file", size: st.size, mtime: st.mtimeMs });
    }
    out.sort((a,b)=> (a.type===b.type ? a.name.localeCompare(b.name) : (a.type==="dir"?-1:1)));
    res.json({ok:true, path: rel, entries: out});
  }catch(e){
    res.status(400).json({ok:false,error:String(e.message||e)});
  }
});

router.get("/servers/:slug/files/read", requireAuth, async (req,res)=>{
  try{
    const s=db.prepare("SELECT * FROM servers WHERE slug=?").get(req.params.slug);
    if(!s) return res.status(404).json({ok:false,error:"Not found"});
    if(!canAccessServer(req.user, s)) return res.status(403).json({ok:false,error:"Forbidden"});
    const rel=req.query.path||"";
    const file=safeJoin(s.base_dir, rel);
    const st=await fsp.stat(file);
    if(st.size > 1024*1024) return res.status(400).json({ok:false,error:"File too large to view (max 1MB)"});
    const content=await fsp.readFile(file,"utf8");
    res.json({ok:true, content});
  }catch(e){
    res.status(400).json({ok:false,error:String(e.message||e)});
  }
});

router.post("/servers/:slug/files/write", requireAuth, async (req,res)=>{
  try{
    const s=db.prepare("SELECT * FROM servers WHERE slug=?").get(req.params.slug);
    if(!s) return res.status(404).json({ok:false,error:"Not found"});
    if(!canAccessServer(req.user, s)) return res.status(403).json({ok:false,error:"Forbidden"});
    const { path:rel, content } = req.body||{};
    const file=safeJoin(s.base_dir, rel);
    await fsp.mkdir(path.dirname(file), { recursive:true });
    await fsp.writeFile(file, String(content??""), "utf8");
    res.json({ok:true});
  }catch(e){
    res.status(400).json({ok:false,error:String(e.message||e)});
  }
});

router.post("/servers/:slug/files/upload", requireAuth, async (req,res)=>{
  try{
    const s=db.prepare("SELECT * FROM servers WHERE slug=?").get(req.params.slug);
    if(!s) return res.status(404).json({ok:false,error:"Not found"});
    if(!canAccessServer(req.user, s)) return res.status(403).json({ok:false,error:"Forbidden"});
    const { path:rel, base64 } = req.body||{};
    if(!rel||!base64) return res.status(400).json({ok:false,error:"path + base64 required"});
    const file=safeJoin(s.base_dir, rel);
    const buf=Buffer.from(String(base64), "base64");
    if(buf.length > 25*1024*1024) return res.status(400).json({ok:false,error:"Too large (max 25MB)"});
    await fsp.mkdir(path.dirname(file), { recursive:true });
    await fsp.writeFile(file, buf);
    res.json({ok:true, bytes: buf.length});
  }catch(e){
    res.status(400).json({ok:false,error:String(e.message||e)});
  }
});

router.post("/servers/:slug/files/delete", requireAuth, async (req,res)=>{
  try{
    const s=db.prepare("SELECT * FROM servers WHERE slug=?").get(req.params.slug);
    if(!s) return res.status(404).json({ok:false,error:"Not found"});
    if(!canAccessServer(req.user, s)) return res.status(403).json({ok:false,error:"Forbidden"});
    const { path:rel } = req.body||{};
    const target=safeJoin(s.base_dir, rel);
    const st=await fsp.stat(target);
    if(st.isDirectory()) await fsp.rm(target, { recursive:true, force:true });
    else await fsp.unlink(target);
    res.json({ok:true});
  }catch(e){
    res.status(400).json({ok:false,error:String(e.message||e)});
  }
});

router.post("/servers/:slug/files/mkdir", requireAuth, async (req,res)=>{
  try{
    const s=db.prepare("SELECT * FROM servers WHERE slug=?").get(req.params.slug);
    if(!s) return res.status(404).json({ok:false,error:"Not found"});
    if(!canAccessServer(req.user, s)) return res.status(403).json({ok:false,error:"Forbidden"});
    const rel = String(req.body?.path||"");
    if(!rel) return res.status(400).json({ok:false,error:"path required"});
    const dir = safeJoin(s.base_dir, rel);
    await fsp.mkdir(dir, { recursive:true });
    res.json({ok:true});
  }catch(e){ res.status(400).json({ok:false,error:String(e.message||e)}); }
});

router.post("/servers/:slug/files/rename", requireAuth, async (req,res)=>{
  try{
    const s=db.prepare("SELECT * FROM servers WHERE slug=?").get(req.params.slug);
    if(!s) return res.status(404).json({ok:false,error:"Not found"});
    if(!canAccessServer(req.user, s)) return res.status(403).json({ok:false,error:"Forbidden"});
    const from = String(req.body?.from||"");
    const to = String(req.body?.to||"");
    if(!from||!to) return res.status(400).json({ok:false,error:"from/to required"});
    const a = safeJoin(s.base_dir, from);
    const b = safeJoin(s.base_dir, to);
    await fsp.mkdir(path.dirname(b), { recursive:true });
    await fsp.rename(a,b);
    res.json({ok:true});
  }catch(e){ res.status(400).json({ok:false,error:String(e.message||e)}); }
});

router.get("/servers/:slug/files/download", requireAuth, async (req,res)=>{
  try{
    const s=db.prepare("SELECT * FROM servers WHERE slug=?").get(req.params.slug);
    if(!s) return res.status(404).end("Not found");
    if(!canAccessServer(req.user, s)) return res.status(403).end("Forbidden");
    const rel = String(req.query.path||"");
    if(!rel) return res.status(400).end("path required");
    const file = safeJoin(s.base_dir, rel);
    const st = await fsp.stat(file);
    if(st.isDirectory()) return res.status(400).end("Not a file");
    res.download(file, path.basename(file));
  }catch(e){ res.status(400).end(String(e.message||e)); }
});

module.exports = router;
