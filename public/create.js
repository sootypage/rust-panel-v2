// Create Server page logic
// Depends on public/app.js (api(), getToken(), requireMe(), logout())

function q(id){ return document.getElementById(id); }

function readPayload(){
  const game = (q("game")?.value || "rust").toLowerCase();

  return {
    game,
    slug: (q("slug")?.value || "").trim(),
    name: (q("name")?.value || "").trim(),

    // Rust fields
    server_port: Number(q("server_port")?.value || 28015),
    query_port: Number(q("query_port")?.value || 28017),
    rcon_host: (q("rcon_host")?.value || "127.0.0.1").trim(),
    rcon_port: Number(q("rcon_port")?.value || 28016),
    rcon_password: (q("rcon_password")?.value || ""),
    maxplayers: Number(q("maxplayers")?.value || 50),
    worldsize: Number(q("worldsize")?.value || 3500),
    seed: Number(q("seed")?.value || 0),
    modded: !!q("modded")?.checked,

    // Minecraft fields (Paper)
    mc_version: (q("mc_version")?.value || "latest").trim(),
    mc_port: Number(q("mc_port")?.value || 25565),
    mc_ram_mb: Number(q("mc_ram_mb")?.value || 2048),
    mc_max_players: Number(q("mc_max_players")?.value || 20),
    mc_motd: (q("mc_motd")?.value || "A Minecraft Server").trim(),
  };
}

function setConsole(line){
  const box = q("installConsole");
  if(!box) return;
  box.textContent += line + "\n";
  box.scrollTop = box.scrollHeight;
}

function setProgress(pct){
  const bar = q("progressBar");
  const label = q("progressLabel");
  if(bar) bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  if(label) label.textContent = `${pct.toFixed(0)}%`;
}

async function startInstallStream(streamId, slug){
  // Server-sent events: /api/install/stream/:id
  setConsole(`[panel] Watching install stream: ${streamId}`);
  setProgress(1);

  return new Promise((resolve, reject)=>{
    const es = new EventSource(`/api/install/stream/${encodeURIComponent(streamId)}`);

    es.onmessage = (ev)=>{
      try{
        const msg = JSON.parse(ev.data);
        if(msg.type === "line"){
          setConsole(msg.line);
          // crude progress: try to parse SteamCMD progress if present
          const m = msg.line.match(/progress:\s*([0-9]+\.[0-9]+)|progress:\s*([0-9]+)/i);
          if(m){
            const v = Number(m[1] || m[2]);
            if(!Number.isNaN(v)) setProgress(Math.max(1, Math.min(99, v)));
          }
        }
        if(msg.type === "done"){
          setProgress(100);
          setConsole("✅ Install finished");
          es.close();
          resolve();
        }
        if(msg.type === "error"){
          setConsole(`❌ ${msg.error || "Install failed"}`);
          es.close();
          reject(new Error(msg.error || "Install failed"));
        }
      }catch{
        // fall back to raw
        setConsole(String(ev.data || ""));
      }
    };

    es.onerror = ()=>{
      setConsole("[error] Lost connection to install stream");
      es.close();
      reject(new Error("install stream disconnected"));
    };

    // When done, auto-redirect to the server page
    resolve().then(()=>{ location.href = `/server.html?slug=${encodeURIComponent(slug)}`; });
  });
}

async function createServer(e){
  e?.preventDefault();

  const out = q("out");
  const btn = q("createBtn");

  if(out) out.textContent = "";
  if(btn) btn.disabled = true;
  q("installConsole") && (q("installConsole").textContent = "");
  setProgress(0);

  try{
    await requireMe();

    const payload = readPayload();
    if(!payload.slug || !payload.name) throw new Error("Slug + Name required");

    setConsole("[panel] Creating server...");

    // app.js api() prefixes /api automatically
    const r = await api("/servers", { method: "POST", body: JSON.stringify(payload) });

    if(r.stream){
      setConsole(`✅ Created. Starting install stream: ${r.stream}`);
      await startInstallStream(r.stream, payload.slug);
    }else{
      setConsole("✅ Created");
      location.href = `/server.html?slug=${encodeURIComponent(payload.slug)}`;
    }
  }catch(err){
    const msg = err?.message || String(err);
    if(out) out.textContent = "❌ " + msg;
    setConsole("[error] " + msg);
    console.error(err);
  }finally{
    if(btn) btn.disabled = false;
  }
}

function toggleGame(){
  const game = (q("game")?.value || "rust").toLowerCase();
  const rust = q("rustFields");
  const mc = q("mcFields");
  if(rust) rust.style.display = game === "rust" ? "block" : "none";
  if(mc) mc.style.display = game === "minecraft" ? "block" : "none";
}

window.addEventListener("DOMContentLoaded", async ()=>{
  const logoutBtn = q("logoutBtn");
  logoutBtn?.addEventListener("click", logout);

  try{
    const me = await requireMe();
    const meEl = q("me");
    if(meEl) meEl.textContent = `Logged in as ${me.username} (${me.role})`;
  }catch{
    return; // redirected to login
  }

  q("game")?.addEventListener("change", toggleGame);
  toggleGame();

  q("createForm")?.addEventListener("submit", createServer);
  q("createBtn")?.addEventListener("click", createServer);
});
