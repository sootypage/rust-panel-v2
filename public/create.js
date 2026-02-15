// public/create.js
requireLogin();
document.getElementById("nav").innerHTML = navHTML("create");
attachLogout();

const out = document.getElementById("out");

const token = localStorage.getItem("token");
const socket = io({ auth: { token } });

let currentStreamId = null;

socket.on("installLine", ({ streamId, line }) => {
  if (!currentStreamId || streamId !== currentStreamId) return;
  out.textContent += line + "\n";
  out.scrollTop = out.scrollHeight;
});

document.getElementById("createBtn").onclick = async () => {
  out.textContent = "";
  const slug = document.getElementById("slug").value.trim();
  const name = document.getElementById("name").value.trim();
  const modded = document.getElementById("modded").checked;
  const memoryMiB = document.getElementById("memoryMiB").value.trim();
  const maxPlayers = Number(document.getElementById("maxPlayers").value.trim() || 100);
  const serverPort = Number(document.getElementById("serverPort").value.trim() || 28015);
  const rconPort = Number(document.getElementById("rconPort").value.trim() || 28016);
  const rconPassword = document.getElementById("rconPassword").value.trim();

  const j = await api("/api/servers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      slug, name, modded,
      memoryMiB: memoryMiB ? Number(memoryMiB) : null,
      maxPlayers, serverPort, rconPort, rconPassword
    })
  });

  if (!j.ok) {
    out.textContent = j.error || "Create failed";
    return;
  }

  currentStreamId = j.streamId;
  out.textContent += `[panel] Installing to ${j.baseDir}\n`;
  out.textContent += `[panel] Watching install stream: ${currentStreamId}\n`;
};
