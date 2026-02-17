window.addEventListener('DOMContentLoaded', async ()=>{
  document.getElementById('logoutBtn').onclick = logout;

  let me;
  try{ me = await requireMe(); }
  catch{ return; }

  document.getElementById('me').textContent = `Logged in as ${me.username} (${me.role})`;

  const list = document.getElementById('list');
  list.innerHTML = '<div class="muted">Loading...</div>';

  try{
    const data = await api('/servers');
    const servers = data.servers || [];
    if(!servers.length){
      list.innerHTML = '<div class="muted">No servers yet. Create one first.</div>';
      return;
    }

    list.innerHTML = '';
    for(const s of servers){
      const row = document.createElement('button');
      row.className = 'serverRow';
      row.innerHTML = `<div><div class="t">${s.name}</div><div class="muted">${s.slug} • ${s.game||'rust'}</div></div><div class="muted">Open →</div>`;
      row.onclick = ()=> location.href = `/server.html?slug=${encodeURIComponent(s.slug)}#files`;
      list.appendChild(row);
    }
  }catch(e){
    list.innerHTML = `<div class="muted">Error: ${e.message || e}</div>`;
  }
});
