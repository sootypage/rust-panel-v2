const token = localStorage.getItem("token");
if (!token) location.href = "/login.html";

const role = localStorage.getItem("role") || "viewer";
document.getElementById("who").textContent = `Role: ${role}`;

document.getElementById("logout").onclick = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  location.href = "/login.html";
};

if (role === "admin" || role === "manager") {
  document.getElementById("createCard").style.display = "block";
}

async function api(path, opts={}) {
  const res = await fetch(path, {
    ...opts,
    headers: { ...(opts.headers||{}), Authorization: `Bearer ${token}` }
  });
  return res.json();
}

async function load() {
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
          <div style="opacity:.7;margin-top:4px;">slug: ${s.slug}</div>
        </div>
        <div class="row">
          <a class="btn" href="/server.html?slug=${encodeURIComponent(s.slug)}">Open</a>
        </div>
      </div>
    `;
    el.appendChild(card);
  }
}

document.getElementById("createBtn").onclick = async () => {
  const slug = document.getElementById("slug").value.trim();
  const name = document.getElementById("name").value.trim();
  const baseDir = document.getElementById("baseDir").value.trim();
  const startCmd = document.getElementById("cmd").value.trim();

  const rcon = {
    host: document.getElementById("rconHost").value.trim() || "127.0.0.1",
    port: parseInt(document.getElementById("rconPort").value.trim(), 10) || null,
    password: document.getElementById("rconPass").value.trim() || null
  };

  const msg = document.getElementById("createMsg");
  const j = await api("/api/servers", {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ slug, name, baseDir, startCmd, rcon })
  });
  msg.textContent = JSON.stringify(j, null, 2);
  await load();
};

load();
setInterval(load, 3000);
