requireLogin();
document.getElementById("nav").innerHTML = navHTML("");
attachLogout();

const params = new URLSearchParams(location.search);
const slug = params.get("slug");

const infoEl = document.getElementById("info");
const logEl = document.getElementById("log");
const metricsEl = document.getElementById("metrics");
document.getElementById("title").textContent = `Server: ${slug}`;

const token = localStorage.getItem("token");
const socket = io({ auth: { token } });

socket.on("connect", () => socket.emit("joinLogs", { slug }));
socket.on("logLine", ({ slug: s, line }) => {
  if (s !== slug) return;
  logEl.textContent += line + "\n";
  logEl.scrollTop = logEl.scrollHeight;
});

function kv(label, value) { return `<div><b>${label}:</b> ${value}</div>`; }

async function refresh() {
  const info = await api(`/api/servers/${encodeURIComponent(slug)}/info`);
  const m = await api(`/api/servers/${encodeURIComponent(slug)}/metrics`);
  const p = await api(`/api/servers/${encodeURIComponent(slug)}/players`);

  const s = info.server || {};
  const endpoint =
    (s.public_ip && s.public_port) ? `${s.public_ip}:${s.public_port}` :
    `127.0.0.1:${s.server_port || 28015}`;

  infoEl.innerHTML = [
    kv("Connect", `<code>${endpoint}</code>`),
    kv("Players", p.ok ? (p.players ?? "N/A") : "N/A"),
    kv("Map", `${s.worldsize || 3500}${s.seed ? " / seed "+s.seed : ""}`),
    kv("Mode", s.modded ? "Modded (uMod)" : "Vanilla")
  ].join("");

  metricsEl.textContent = JSON.stringify({
    endpoint,
    players: p.ok ? p.players : null,
    cpu: m.cpu,
    memoryMiB: m.memoryBytes ? Math.round(m.memoryBytes/1024/1024) : null,
    running: m.running,
    pid: m.pid
  }, null, 2);
}
setInterval(refresh, 3000);
refresh();

document.getElementById("start").onclick = async () => { await api(`/api/servers/${encodeURIComponent(slug)}/start`, { method:"POST" }); };
document.getElementById("stop").onclick = async () => { await api(`/api/servers/${encodeURIComponent(slug)}/stop`, { method:"POST" }); };
document.getElementById("restart").onclick = async () => { await api(`/api/servers/${encodeURIComponent(slug)}/restart`, { method:"POST" }); };
