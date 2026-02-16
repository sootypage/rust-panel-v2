const express = require("express");
const bcrypt = require("bcrypt");
const path = require("path");
const { spawn } = require("child_process");
const pidusage = require("pidusage");

const { db } = require("./db");
const { sign, requireAuth, requireRole } = require("./auth");
const { installRust } = require("./installer");
const { createService, start, stop, restart, serviceName, mainPid } = require("./systemd");
const { sendRcon } = require("./rcon");

const RUST_ROOT = process.env.RUST_ROOT || "/srv/rust";
const router = express.Router();

router.get("/health", (_q,res)=>res.json({ok:true}));

router.post("/auth/bootstrap", (req,res)=>{
  const c = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
  if (c>0) return res.status(400).json({ok:false,error:"Already bootstrapped"});
  const { username, password } = req.body||{};
  if(!username||!password) return res.status(400).json({ok:false,error:"username/password required"});
  const hash = bcrypt.hashSync(password,12);
  db.prepare("INSERT INTO users (username,password_hash,role) VALUES (?,?,?)").run(username,hash,"owner");
  res.json({ok:true});
});

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

router.get("/servers", requireAuth, (req,res)=>{
  let rows;
  if (req.user.role==="owner"||req.user.role==="admin") rows=db.prepare("SELECT * FROM servers ORDER BY created_at DESC").all();
  else rows=db.prepare("SELECT * FROM servers WHERE owner_user_id=? ORDER BY created_at DESC").all(req.user.id);
  res.json({ok:true,servers:rows.map(s=>({...s, service_name: serviceName(s.slug), rcon_password: undefined}))});
});

router.post("/servers", requireAuth, requireRole(["owner","admin"]), async (req,res)=>{
  try{
    const b=req.body||{};
    const slug=String(b.slug||"").trim();
    if(!slug||!/^[a-zA-Z0-9_-]{1,32}$/.test(slug)) return res.status(400).json({ok:false,error:"Invalid slug"});
    const base_dir = path.join(RUST_ROOT, slug);
    const row={
      slug,
      name: String(b.name||slug).trim(),
      base_dir,
      server_port: Number(b.server_port||28015),
      query_port: Number(b.query_port||28017),
      rcon_host: String(b.rcon_host||"127.0.0.1"),
      rcon_port: Number(b.rcon_port||28016),
      rcon_password: String(b.rcon_password||""),
      maxplayers: Number(b.maxplayers||50),
      worldsize: Number(b.worldsize||3500),
      seed: Number(b.seed||0),
      level: String(b.level||"Procedural Map"),
      modded: b.modded?1:0,
      owner_user_id: req.user.id
    };
    db.prepare(`INSERT INTO servers
      (slug,name,game,base_dir,server_port,query_port,rcon_host,rcon_port,rcon_password,maxplayers,worldsize,seed,level,modded,owner_user_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(row.slug,row.name,"rust",row.base_dir,row.server_port,row.query_port,row.rcon_host,row.rcon_port,row.rcon_password,row.maxplayers,row.worldsize,row.seed,row.level,row.modded,row.owner_user_id);

    await installRust({ baseDir: base_dir, onLine: ()=>{} });
    await createService(row, { onLine: ()=>{} });

    res.json({ok:true});
  }catch(e){
    const msg = String(e?.message||e);
    if (msg.includes("UNIQUE constraint failed")) return res.status(400).json({ok:false,error:"Slug already exists"});
    res.status(500).json({ok:false,error:msg});
  }
});

router.get("/servers/:slug", requireAuth, (req,res)=>{
  const s=db.prepare("SELECT * FROM servers WHERE slug=?").get(req.params.slug);
  if(!s) return res.status(404).json({ok:false,error:"Not found"});
  if(!(req.user.role==="owner"||req.user.role==="admin"||s.owner_user_id===req.user.id)) return res.status(403).json({ok:false,error:"Forbidden"});
  res.json({ok:true,server:{...s, service_name: serviceName(s.slug), rcon_password: undefined}});
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

  const p = spawn("sudo", ["-n","journalctl","-u", serviceName(slug), "-n", "200", "-f", "--no-pager"]);
  const sendLine = (line)=>res.write(`data: ${line.replace(/\r/g,"")}\n\n`);
  p.stdout.on("data",(b)=>b.toString("utf8").split("\n").filter(Boolean).forEach(sendLine));
  p.stderr.on("data",(b)=>b.toString("utf8").split("\n").filter(Boolean).forEach(l=>sendLine("[err] "+l)));

  req.on("close", ()=>{ try{ p.kill("SIGKILL"); }catch{} });
});

module.exports = router;
