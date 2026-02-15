\
requireLogin();
document.getElementById("nav").innerHTML = navHTML("files");
attachLogout();

const serverSelect = document.getElementById("serverSelect");
const pathInput = document.getElementById("path");
const listEl = document.getElementById("list");
const filePath = document.getElementById("filePath");
const content = document.getElementById("content");
const out = document.getElementById("out");
const uploadOut = document.getElementById("uploadOut");

let servers = [];

async function loadServers() {
  servers = await api("/api/servers");
  serverSelect.innerHTML = "";
  for (const s of servers) {
    const opt = document.createElement("option");
    opt.value = s.slug;
    opt.textContent = `${s.name} (${s.slug})`;
    serverSelect.appendChild(opt);
  }
}
loadServers();

function joinPath(a, b) {
  if (!a) return b || "";
  if (!b) return a;
  return a.replace(/\/+$/, "") + "/" + b.replace(/^\/+/, "");
}

async function loadFolder(rel="") {
  const slug = serverSelect.value;
  const j = await api(`/api/servers/${encodeURIComponent(slug)}/files?path=${encodeURIComponent(rel)}`);
  if (!j.ok) { listEl.textContent = j.error || "Failed"; return; }

  pathInput.value = j.path || "";

  const items = j.items || [];
  listEl.innerHTML = "";
  const upBtn = document.createElement("button");
  upBtn.className = "btn";
  upBtn.textContent = "⬅ Up";
  upBtn.onclick = () => {
    const p = (pathInput.value || "").split("/").filter(Boolean);
    p.pop();
    loadFolder(p.join("/"));
  };
  listEl.appendChild(upBtn);

  const ul = document.createElement("div");
  ul.style.marginTop = "10px";

  items.sort((x,y) => Number(y.isDir)-Number(x.isDir) || x.name.localeCompare(y.name));

  for (const it of items) {
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.style.margin = "6px 6px 0 0";
    btn.textContent = it.isDir ? `📁 ${it.name}` : `📄 ${it.name}`;
    btn.onclick = async () => {
      const relPath = joinPath(pathInput.value, it.name);
      if (it.isDir) return loadFolder(relPath);

      filePath.value = relPath;
      const f = await api(`/api/servers/${encodeURIComponent(slug)}/file?path=${encodeURIComponent(relPath)}`);
      if (!f.ok) return (out.textContent = f.error || "Read failed");
      content.value = f.content || "";
      out.textContent = "Loaded file.";
    };
    ul.appendChild(btn);
  }

  listEl.appendChild(ul);
}

document.getElementById("load").onclick = () => loadFolder(pathInput.value.trim());

document.getElementById("save").onclick = async () => {
  const slug = serverSelect.value;
  const p = filePath.value.trim();
  if (!p) return (out.textContent = "Pick a file first.");
  const j = await api(`/api/servers/${encodeURIComponent(slug)}/file`, {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({ path: p, content: content.value })
  });
  out.textContent = JSON.stringify(j, null, 2);
};

document.getElementById("uploadPlugin").onclick = async () => {
  uploadOut.textContent = "";
  const slug = serverSelect.value;
  const f = document.getElementById("pluginFile").files[0];
  if (!f) return (uploadOut.textContent = "Choose a .cs plugin file");

  const fd = new FormData();
  fd.append("file", f);

  const token = localStorage.getItem("token");
  const res = await fetch(`/api/servers/${encodeURIComponent(slug)}/plugins/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd
  });
  const j = await res.json();
  uploadOut.textContent = JSON.stringify(j, null, 2);
};

setTimeout(() => loadFolder(""), 500);
