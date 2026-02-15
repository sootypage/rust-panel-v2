const token = localStorage.getItem("token");
if (!token) location.href = "/login.html";

const params = new URLSearchParams(location.search);
const slug = params.get("slug");

const titleEl = document.getElementById("title");
const statusEl = document.getElementById("status");
const logsEl = document.getElementById("logs");
const metricsEl = document.getElementById("metrics");
const pluginsEl = document.getElementById("plugins");
const filesEl = document.getElementById("files");

function setStatus(running) {
  statusEl.textContent = running ? "RUNNING" : "OFFLINE";
  statusEl.className = `badge ${running ? "on" : "off"}`;
}

async function api(path, opts={}) {
  const res = await fetch(path, {
    ...opts,
    headers: { ...(opts.headers||{}), Authorization: `Bearer ${token}` }
  });
  return res.json();
}

async function refreshStatus() {
  const j = await api(`/api/servers/${encodeURIComponent(slug)}/status`);
  titleEl.textContent = j.name || slug;
  setStatus(!!j.running);
}

async function refreshMetrics() {
  const j = await api(`/api/servers/${encodeURIComponent(slug)}/metrics`);
  metricsEl.textContent = JSON.stringify(j, null, 2);
}

document.getElementById("startBtn").onclick = async () => { await api(`/api/servers/${slug}/start`, { method:"POST" }); await refreshStatus(); };
document.getElementById("stopBtn").onclick = async () => { await api(`/api/servers/${slug}/stop`, { method:"POST" }); await refreshStatus(); };
document.getElementById("restartBtn").onclick = async () => { await api(`/api/servers/${slug}/restart`, { method:"POST" }); await refreshStatus(); };

document.getElementById("backupBtn").onclick = async () => {
  const j = await api(`/api/servers/${slug}/backup`, { method:"POST" });
  alert(j.ok ? `Backup created: ${j.backup.file}` : `Backup error: ${j.error}`);
};

async function refreshPlugins() {
  const j = await api(`/api/servers/${encodeURIComponent(slug)}/plugins`);
  pluginsEl.textContent = JSON.stringify(j, null, 2);
}

document.getElementById("uploadPluginBtn").onclick = async () => {
  const f = document.getElementById("pluginFile").files[0];
  if (!f) return alert("Pick a .cs file first");
  const fd = new FormData();
  fd.append("file", f);
  const res = await fetch(`/api/servers/${encodeURIComponent(slug)}/plugins/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd
  });
  const j = await res.json();
  alert(j.ok ? "Uploaded" : j.error);
  await refreshPlugins();
};

document.getElementById("listBtn").onclick = async () => {
  const p = document.getElementById("path").value.trim() || ".";
  const j = await api(`/api/servers/${encodeURIComponent(slug)}/files?path=${encodeURIComponent(p)}`);
  filesEl.textContent = JSON.stringify(j, null, 2);
};

const socket = io({ auth: { token }});
socket.on("connect_error", (err) => {
  logsEl.textContent += `[socket] ${err.message}\n`;
});
socket.on("logLine", ({ slug: s, line }) => {
  if (s !== slug) return;
  logsEl.textContent += line + "\n";
  logsEl.scrollTop = logsEl.scrollHeight;
});
socket.emit("joinLogs", { slug });

refreshStatus();
refreshMetrics();
refreshPlugins();
setInterval(refreshStatus, 3000);
setInterval(refreshMetrics, 5000);
