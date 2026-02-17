function token(){ return localStorage.getItem("token"); }
function requireLogin(){ if(!token()) location.href = "/login.html"; }
function qs(k){ return new URLSearchParams(location.search).get(k); }

let es = null;

function setProgress(pct){
  const bar = document.getElementById("bar");
  const pctEl = document.getElementById("pct");
  const n = Math.max(0, Math.min(100, Number(pct)||0));
  bar.style.width = n + "%";
  pctEl.textContent = `Install progress: ${n.toFixed(1)}%`;
}

function append(line){
  const ta = document.getElementById("console");
  ta.value += line + "\n";
  ta.scrollTop = ta.scrollHeight;
}

function connect(id){
  if(es) try{ es.close(); }catch{}
  const t = token();
  const url = `/api/install/${encodeURIComponent(id)}?token=${encodeURIComponent(t)}`;
  document.getElementById("downloadBtn").disabled = false;

  append(`--- Connected to ${id} ---`);
  es = new EventSource(url);

  es.addEventListener("log", (ev)=>{
    try{
      const j = JSON.parse(ev.data);
      if(j.line) append(j.line.replace(/\x1b\[[0-9;]*m/g,""));
    }catch{}
  });

  es.addEventListener("progress", (ev)=>{
    try{ const j = JSON.parse(ev.data); if(j.pct!=null) setProgress(j.pct); }catch{}
  });

  es.addEventListener("done", ()=>{
    append("--- DONE ---");
    setProgress(100);
    try{ es.close(); }catch{}
  });

  es.addEventListener("error", ()=>{
    append("--- stream error (server may have closed) ---");
  });
}

window.addEventListener("DOMContentLoaded", ()=>{
  requireLogin();
  const idInput = document.getElementById("streamId");
  const fromQ = qs("id");
  if(fromQ) idInput.value = fromQ;

  document.getElementById("logout").onclick = ()=>{ localStorage.removeItem("token"); location.href="/login.html"; };

  document.getElementById("connectBtn").onclick = ()=>{
    const id = idInput.value.trim();
    if(!id) return alert("Enter stream id");
    document.getElementById("console").value = "";
    setProgress(0);
    connect(id);
  };

  document.getElementById("downloadBtn").onclick = ()=>{
    const id = idInput.value.trim();
    if(!id) return;
    fetch(`/api/install/${encodeURIComponent(id)}/log`, {
      headers: { "Authorization": "Bearer " + token() }
    }).then(async r=>{
      if(!r.ok) throw new Error(await r.text());
      const text = await r.text();
      const blob = new Blob([text], {type:"text/plain"});
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = id + ".log";
      a.click();
      URL.revokeObjectURL(a.href);
    }).catch(err=> alert("Download failed: " + err));
  };
});
