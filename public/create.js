\
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

  const memoryMiBRaw = document.getElementById("memoryMiB").value.trim();
  const memoryMiB = memoryMiBRaw ? Number(memoryMiBRaw) : null;

  const maxPlayers = Number(document.getElementById("maxPlayers").value.trim() || 100);
  const worldsize = Number(document.getElementById("worldsize").value.trim() || 3500);

  const seedRaw = document.getElementById("seed").value.trim();
  const seed = seedRaw ? Number(seedRaw) : null;

  const serverPort = Number(document.getElementById("serverPort").value.trim() || 28015);
  const queryPort = Number(document.getElementById("queryPort").value.trim() || (serverPort + 1));
  const rconPort = Number(document.getElementById("rconPort").value.trim() || 28016);
  const rconPassword = document.getElementById("rconPassword").value.trim();

  const useVps = document.getElementById("useVps")?.checked || false;
  const vpsIp = (document.getElementById("vpsIp")?.value || "").trim() || null;
  const publicIp = document.getElementById("publicIp").value.trim() || null;
  const publicPort = Number(document.getElementById("publicPort").value.trim() || serverPort);

  const playitEnabled = document.getElementById("playitEnabled").checked;
  const playitEndpoint = document.getElementById("playitEndpoint").value.trim() || null;
  const playitToken = document.getElementById("playitToken").value.trim() || null;

  const j = await api("/api/servers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      slug, name, modded,
      memoryMiB, maxPlayers,
      worldsize, seed,
      serverPort, rconPort, rconPassword,
      publicIp, publicPort,
      useVps, vpsIp, queryPort,
      playitEnabled, playitEndpoint, playitToken
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
