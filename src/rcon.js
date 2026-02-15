const { Rcon } = require("rcon-client");
const { db } = require("./db");

async function rconCommand(slug, command) {
  const s = db.prepare("SELECT * FROM servers WHERE slug=?").get(slug);
  if (!s) throw new Error("Server not found");
  const rcon = await Rcon.connect({ host: s.rcon_host || "127.0.0.1", port: Number(s.rcon_port), password: s.rcon_password });
  try { return await rcon.send(command); } finally { rcon.end(); }
}

function parsePlayersFromStatus(text) {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const idx = lines.findIndex(l => l.toLowerCase().startsWith("id") && l.toLowerCase().includes("name"));
  if (idx === -1) return { players: 0 };
  const playerLines = lines.slice(idx + 1).filter(l => /^\d+/.test(l));
  return { players: playerLines.length };
}

async function getPlayers(slug) {
  const txt = await rconCommand(slug, "status");
  return parsePlayersFromStatus(txt);
}

module.exports = { rconCommand, getPlayers };
