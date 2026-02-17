function qs(id){ return document.getElementById(id); }

function fmtBytes(n){
  if(!Number.isFinite(n)) return "-";
  const u=["B","KiB","MiB","GiB","TiB"];
  let i=0, v=n;
  while(v>=1024 && i<u.length-1){ v/=1024; i++; }
  return `${v.toFixed(i===0?0:2)} ${u[i]}`;
}
function pct(n){ return Number.isFinite(n) ? `${n.toFixed(2)}%` : "—"; }

function fmtUptime(sec){
  if(!Number.isFinite(sec)) return "—";
  sec = Math.max(0, Math.floor(sec));
  const d = Math.floor(sec/86400); sec%=86400;
  const h = Math.floor(sec/3600); sec%=3600;
  const m = Math.floor(sec/60); sec%=60;
  const parts=[];
  if(d) parts.push(`${d}d`);
  if(h||parts.length) parts.push(`${h}h`);
  if(m||parts.length) parts.push(`${m}m`);
  parts.push(`${sec}s`);
  return parts.join(" ");
}

function slugFromURL(){
  const u = new URL(location.href);
  return u.searchParams.get("slug") || "";
}

async function load(){
  const slug = slugFromURL();
  if(!slug) throw new Error("Missing slug");

  const me = await requireMe();
  qs("meSub").textContent = `Logged in as ${me.username} (${me.role})`;

  const s = (await api(`/servers/${encodeURIComponent(slug)}`)).server;
  qs("title").textContent = s.name || s.slug;
  const addr = `${location.hostname}:${s.server_port || 28015}`;
  qs("addr").textContent = `Address: ${addr} (query ${s.query_port||28017})`;
  qs("subtitle").textContent = `${(s.game||"rust").toUpperCase()} • ${s.slug}`;

  await refreshMetrics(slug);
  startLogStream(slug);
}

let logES = null;
function startLogStream(slug){
  if(logES) try{ logES.close(); }catch{}
  const t = localStorage.getItem("token") || "";
  const consoleEl = qs("console");
  consoleEl.textContent = "";
  logES = new EventSource(`/api/servers/${encodeURIComponent(slug)}/logs?token=${encodeURIComponent(t)}`);
  logES.onmessage = (ev)=>{
    consoleEl.textContent += (consoleEl.textContent ? "\n" : "") + ev.data;
    consoleEl.scrollTop = consoleEl.scrollHeight;
  };
}

async function refreshMetrics(slug){
  const m = await api(`/servers/${encodeURIComponent(slug)}/metrics`).catch(()=>null);
  qs("status").textContent = m?.running ? "Online" : "Offline";
  qs("cpu").textContent = pct(m?.cpuPct);
  qs("ram").textContent = fmtBytes(m?.memoryBytes);
  qs("uptime").textContent = fmtUptime(m?.uptimeSec);

  // best effort player count via rcon
  qs("players").textContent = "—";
  try{
    const r = await api(`/servers/${encodeURIComponent(slug)}/rcon`, {
      method:"POST",
      body: JSON.stringify({ cmd:"playerlist" })
    });
    const txt = String(r.output||"").trim();
    if(txt){
      const lines = txt.split("\n").filter(l=>l.trim());
      // Rust "playerlist" often prints "id name ..." per line
      const count = lines.filter(l=>/^\d+\s+/.test(l)).length;
      qs("players").textContent = count ? String(count) : "—";
    }
  }catch{}
}

async function sendCmd(){
  const slug = slugFromURL();
  const cmd = qs("cmd").value.trim();
  if(!cmd) return;
  qs("cmd").value = "";
  const consoleEl = qs("console");
  consoleEl.textContent += (consoleEl.textContent ? "\n" : "") + `> ${cmd}`;
  consoleEl.scrollTop = consoleEl.scrollHeight;
  try{
    const r = await api(`/servers/${encodeURIComponent(slug)}/rcon`, {
      method:"POST",
      body: JSON.stringify({ cmd })
    });
    if(r.output){
      consoleEl.textContent += "\n" + String(r.output).trim();
      consoleEl.scrollTop = consoleEl.scrollHeight;
    }
  }catch(e){
    consoleEl.textContent += "\n" + `[error] ${e.message||e}`;
  }
}

async function action(kind){
  const slug = slugFromURL();
  await api(`/servers/${encodeURIComponent(slug)}/${kind}`, { method:"POST" });
  await refreshMetrics(slug);
}

qs("refresh")?.addEventListener("click", ()=>refreshMetrics(slugFromURL()).catch(e=>alert(e.message||e)));
qs("send")?.addEventListener("click", sendCmd);
qs("cmd")?.addEventListener("keydown", (e)=>{ if(e.key==="Enter") sendCmd(); });
qs("start")?.addEventListener("click", ()=>action("start").catch(e=>alert(e.message||e)));
qs("stop")?.addEventListener("click", ()=>action("stop").catch(e=>alert(e.message||e)));
qs("restart")?.addEventListener("click", ()=>action("restart").catch(e=>alert(e.message||e)));

qs("downloadLogs")?.addEventListener("click", ()=>{
  // best-effort: open journalctl stream in new tab (it will keep streaming)
  const slug = slugFromURL();
  const t = localStorage.getItem("token")||"";
  window.open(`/api/servers/${encodeURIComponent(slug)}/logs?token=${encodeURIComponent(t)}`, "_blank");
});

load().catch(e=>alert(e.message||e));
