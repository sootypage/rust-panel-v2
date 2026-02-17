// Create Server page logic
// Depends on public/app.js (api(), getToken(), requireMe(), logout())

function q(id){ return document.getElementById(id); }

function readPayload(){
  const game = (q("game")?.value || "rust").toLowerCase();

  const base = {
    game,
    slug: (q("slug")?.value || "").trim(),
    name: (q("name")?.value || "").trim(),
  };

  if(game === "minecraft"){
    return {
      ...base,
      // backend expects these common fields
      server_port: Number(q("mc_port")?.value || 25565),
      ram_mb: Number(q("mc_ram_mb")?.value || 2048),
      maxplayers: Number(q("mc_max_players")?.value || 20),

      mc_software: (q("mc_software")?.value || "paper").toLowerCase(),
      mc_version: (q("mc_version")?.value || "latest").trim(),
      mc_motd: (q("mc_motd")?.value || "A Minecraft Server").trim(),
    };
  }

  // Rust
  return {
    ...base,
    server_port: Number(q("server_port")?.value || 28015),
    query_port: Number(q("query_port")?.value || 28017),
    rcon_host: (q("rcon_host")?.value || "127.0.0.1").trim(),
    rcon_port: Number(q("rcon_port")?.value || 28016),
    rcon_password: (q("rcon_password")?.value || ""),
    maxplayers: Number(q("maxplayers")?.value || 50),
    worldsize: Number(q("worldsize")?.value || 3500),
    seed: Number(q("seed")?.value || 0),
    modded: !!q("modded")?.checked,
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
  // Server-sent events: /api/install/:id
  setConsole(`[panel] Watching install stream: ${streamId}`);
  setProgress(1);

  return new Promise((resolve, reject)=>{
    const es = new EventSource(`/api/install/${encodeURIComponent(streamId)}`);

    es.addEventListener("line", (ev)=>{
      try{
        const msg = JSON.parse(ev.data);
        const line = msg?.line ?? "";
        setConsole(line);
        const m = String(line).match(/progress:\s*([0-9]+\.?[0-9]*)/i);
        if(m){
          const v = Number(m[1]);
          if(!Number.isNaN(v)) setProgress(Math.max(1, Math.min(99, v)));
        }
      }catch{}
    });

    es.addEventListener("done", (ev)=>{
      try{
        const msg = JSON.parse(ev.data);
        if(msg?.ok){
          setProgress(100);
          setConsole("✅ Install finished");
          es.close();
          resolve();
          location.href = `/server.html?slug=${encodeURIComponent(slug)}`;
        } else {
          es.close();
          reject(new Error(msg?.error || "Install failed"));
        }
      }catch{
        es.close();
        resolve();
      }
    });

    es.onerror = ()=>{
      setConsole("[error] Lost connection to install stream");
      es.close();
      reject(new Error("install stream disconnected"));
    };
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
    setConsole(`✅ Created. Starting install stream: ${r.installId}`);
    await startInstallStream(r.installId, payload.slug);
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
