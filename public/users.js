function qs(id){ return document.getElementById(id); }

async function load(){
  const me = await requireMe();
  qs("meSub").textContent = `Logged in as ${me.username} (${me.role})`;
  await refresh();
}

async function refresh(){
  const data = await api("/users");
  const users = data.users || [];
  qs("count").textContent = `${users.length} user${users.length===1?"":"s"}`;
  const el = qs("users");
  el.innerHTML = "";
  for(const u of users){
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="server-card" style="padding:12px 14px; cursor:default;">
        <div class="server-icon" style="width:38px;height:38px;border-radius:14px;">👤</div>
        <div class="server-title" style="min-width:0;">
          <div class="name" style="font-size:14px;">${u.username}</div>
          <div class="game">Role: ${u.role} • Created: ${u.created_at}</div>
        </div>
      </div>`;
    el.appendChild(card);
  }
}

qs("refreshBtn")?.addEventListener("click", ()=>refresh().catch(e=>alert(e.message||e)));

qs("userForm")?.addEventListener("submit", async (e)=>{
  e.preventDefault();
  qs("out").textContent = "Creating…";
  try{
    await api("/users",{
      method:"POST",
      body: JSON.stringify({ username: qs("nu").value.trim(), password: qs("np").value, role: qs("nr").value })
    });
    qs("nu").value=""; qs("np").value="";
    qs("out").textContent = "✅ Created";
    await refresh();
  }catch(err){
    qs("out").textContent = "❌ " + (err.message||err);
  }
});

load().catch(e=>alert(e.message||e));
