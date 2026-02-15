// public/server.js
requireLogin();
document.getElementById("nav").innerHTML = navHTML(""); // no highlight on server page
attachLogout();

const params = new URLSearchParams(location.search);
const slug = params.get("slug");
const logEl = document.getElementById("log");
const metricsEl = document.getElementById("metrics");
document.getElementById("title").textContent = `Server: ${slug}`;

const token = localStorage.getItem("token");
const socket = io({ auth: { token } });

socket.on("connect", () => {
  socket.emit("joinLogs", { slug });
});

socket.on("logLine", ({ slug: s, line }) => {
  if (s !== slug) return;
  logEl.textContent += line + "\n";
  logEl.scrollTop = logEl.scrollHeight;
});

async function refresh() {
  const m = await api(`/api/servers/${encodeURIComponent(slug)}/metrics`);
  metricsEl.textContent = JSON.stringify(m, null, 2);
}
setInterval(refresh, 2000);
refresh();

document.getElementById("start").onclick = async () => {
  await api(`/api/servers/${encodeURIComponent(slug)}/start`, { method:"POST" });
};
document.getElementById("stop").onclick = async () => {
  await api(`/api/servers/${encodeURIComponent(slug)}/stop`, { method:"POST" });
};
document.getElementById("restart").onclick = async () => {
  await api(`/api/servers/${encodeURIComponent(slug)}/restart`, { method:"POST" });
};
