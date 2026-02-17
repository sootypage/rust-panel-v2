async function fetchJSON(url, opts={}){
  const r = await fetch(url, opts);
  const j = await r.json().catch(()=> ({}));
  if(!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

function fmtBytes(n){
  if(!Number.isFinite(n)) return "-";
  const u=["B","KiB","MiB","GiB","TiB"];
  let i=0; let v=n;
  while(v>=1024 && i<u.length-1){ v/=1024; i++; }
  return `${v.toFixed(i===0?0:2)} ${u[i]}`;
}

function pct(n){
  if(!Number.isFinite(n)) return "-";
  return `${n.toFixed(2)}%`;
}

function serverAddr(s){
  const host = window.location.hostname;
  const port = s.server_port || s.serverPort || 28015;
  return `${host}:${port}`;
}

async function load(){
  const meSub = document.getElementById("meSub");
  const panelAddr = document.getElementById("panelAddr");
  const listEl = document.getElementById("servers");
  const emptyEl = document.getElementById("empty");
  const countEl = document.getElementById("count");

  panelAddr.textContent = `Panel: ${window.location.hostname}:${window.location.port || 80}`;

  const me = await requireMe();
  meSub.textContent = `Logged in as ${me.username} (${me.role})`;

  const data = await api("/servers");
  const servers = data.servers || [];
  countEl.textContent = `${servers.length} server${servers.length===1?"":"s"}`;

  listEl.innerHTML = "";
  emptyEl.style.display = servers.length ? "none" : "block";

  // Pull metrics (best effort)
  const metricsMap = new Map();
  await Promise.all(servers.map(async (s)=>{
    try{
      const m = await api(`/servers/${encodeURIComponent(s.slug)}/metrics`);
      metricsMap.set(s.slug, m);
    }catch{
      metricsMap.set(s.slug, null);
    }
  }));

  for(const s of servers){
    const m = metricsMap.get(s.slug);
    const running = m?.running ?? false;
    const cpu = m?.cpuPct;
    const rss = m?.memoryBytes;

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="server-card" role="button" tabindex="0">
        <div class="server-icon">🖥️</div>
        <div class="server-title">
          <div class="name">${escapeHtml(s.name || s.slug)}</div>
          <div class="game">${escapeHtml((s.game||"rust").toUpperCase())} • <span class="muted">${escapeHtml(s.slug)}</span></div>
        </div>

        <div class="metrics">
          <div class="metric">
            <div class="dot ${running?"good":"bad"}"></div>
            <div class="kv">
              <div class="k">Status</div>
              <div class="v">${running?"Online":"Offline"}</div>
            </div>
          </div>

          <div class="metric">
            <div class="kv">
              <div class="k">Address</div>
              <div class="v">${escapeHtml(serverAddr(s))}</div>
            </div>
          </div>

          <div class="metric">
            <div class="kv">
              <div class="k">CPU</div>
              <div class="v">${cpu==null?"—":pct(cpu)}</div>
            </div>
          </div>

          <div class="metric">
            <div class="kv">
              <div class="k">RAM</div>
              <div class="v">${rss==null?"—":fmtBytes(rss)}</div>
            </div>
          </div>
        </div>
      </div>
    `;

    const open = ()=> location.href = `/server.html?slug=${encodeURIComponent(s.slug)}`;
    card.querySelector(".server-card").addEventListener("click", open);
    card.querySelector(".server-card").addEventListener("keydown", (e)=>{ if(e.key==="Enter") open(); });

    listEl.appendChild(card);
  }
}

function escapeHtml(s){
  return String(s??"").replace(/[&<>"']/g, (c)=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]));
}

document.getElementById("refreshBtn")?.addEventListener("click", ()=>load().catch(e=>alert(e.message||e)));
load().catch(e=>alert(e.message||e));

// Auto-refresh every 5s so status/CPU/RAM stays live.
setInterval(()=>{
  if (document.hidden) return;
  load().catch(()=>{});
}, 5000);
