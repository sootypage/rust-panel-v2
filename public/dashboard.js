requireLogin();
document.getElementById("nav").innerHTML = navHTML("dashboard");
attachLogout();

async function loadMe() {
  const j = await api("/api/me");
  document.getElementById("who").textContent = j.ok ? `Logged in as ${j.user.username} (${j.user.role})` : "Not logged in";
  if (j.ok) localStorage.setItem("role", j.user.role);
}

async function loadServers() {
  const servers = await api("/api/servers");
  const el = document.getElementById("servers");
  el.innerHTML = "";
  for (const s of servers) {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="row" style="justify-content:space-between;align-items:center;">
        <div>
          <div style="font-size:18px;font-weight:bold;">${s.name}</div>
          <div class="badge ${s.running ? "on":"off"}">${s.running ? "RUNNING":"OFFLINE"}</div>
          <div class="small">slug: ${s.slug} • ${s.modded ? "Modded (uMod)" : "Vanilla"} ${s.endpoint ? "• connect: "+s.endpoint : ""}</div>
        </div>
        <div class="row">
          <a class="btn" href="/server.html?slug=${encodeURIComponent(s.slug)}">Open</a>
        </div>
      </div>
    `;
    el.appendChild(card);
  }
}

loadMe();
loadServers();
setInterval(loadServers, 5000);
