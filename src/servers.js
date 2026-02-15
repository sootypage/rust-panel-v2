// src/servers.js
const { db } = require("./db");
const { createService, startService, stopService, restartService, statusService } = require("./systemd");
const { installRustDedicated, installUMod } = require("./installer");

function listServers() {
  return db.prepare(
    "SELECT id, slug, name, modded, memory_mib, max_players, server_port, rcon_host, rcon_port, service_name FROM servers ORDER BY id DESC"
  ).all();
}

function getServerBySlug(slug) {
  return db.prepare("SELECT * FROM servers WHERE slug = ?").get(slug);
}

function buildStartCmd({ slug, maxPlayers, serverPort, rconHost, rconPort, rconPassword, hostname }) {
  return [
    "./RustDedicated",
    "-batchmode", "-nographics",
    `+server.identity "${slug}"`,
    `+server.port ${serverPort}`,
    `+server.level "Procedural Map"`,
    `+server.seed 12345`,
    `+server.worldsize 3500`,
    `+server.maxplayers ${maxPlayers}`,
    `+server.hostname "${hostname}"`,
    `+server.description "Hosted with Rust Panel"`,
    `+rcon.web 1`,
    `+rcon.ip ${rconHost}`,
    `+rcon.port ${rconPort}`,
    `+rcon.password "${rconPassword}"`
  ].join(" ");
}

async function createServerWizard({ slug, name, baseDir, modded, memoryMiB, maxPlayers, serverPort, rconHost, rconPort, rconPassword, onLine }) {
  const serviceName = `rust-${slug}.service`;
  const startCmd = buildStartCmd({
    slug,
    maxPlayers,
    serverPort,
    rconHost,
    rconPort,
    rconPassword,
    hostname: name
  });

  db.prepare(`
    INSERT INTO servers (slug, name, base_dir, start_cmd, modded, memory_mib, max_players, server_port, rcon_host, rcon_port, rcon_password, service_name)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    slug, name, baseDir, startCmd,
    modded ? 1 : 0,
    memoryMiB || null,
    maxPlayers,
    serverPort,
    rconHost,
    rconPort,
    rconPassword,
    serviceName
  );

  onLine?.("[installer] Installing RustDedicated...");
  await installRustDedicated({ baseDir, onLine });

  if (modded) {
    onLine?.("[installer] Installing uMod/Oxide...");
    await installUMod({ baseDir, onLine });
  }

  onLine?.("[systemd] Creating service...");
  await createService({ slug, baseDir, startCmd, memoryMiB });

  return getServerBySlug(slug);
}

async function serverStatus(slug) {
  const s = getServerBySlug(slug);
  if (!s) throw new Error("Server not found");
  const running = await statusService(s.service_name);
  return { slug: s.slug, name: s.name, running };
}

async function start(slug) { const s = getServerBySlug(slug); if (!s) throw new Error("Server not found"); await startService(s.service_name); }
async function stop(slug) { const s = getServerBySlug(slug); if (!s) throw new Error("Server not found"); await stopService(s.service_name); }
async function restart(slug) { const s = getServerBySlug(slug); if (!s) throw new Error("Server not found"); await restartService(s.service_name); }

module.exports = { listServers, getServerBySlug, createServerWizard, serverStatus, start, stop, restart };
