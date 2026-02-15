const { db } = require("./db");
const { createService, startService, stopService, restartService, statusService } = require("./systemd");
const { installServerBundle } = require("./installer");

function listServers() {
  return db.prepare(
    `SELECT id, slug, name, modded, memory_mib, max_players, server_port, query_port, public_ip, public_port
     FROM servers ORDER BY id DESC`
  ).all();
}

function getServerBySlug(slug) {
  return db.prepare("SELECT * FROM servers WHERE slug=?").get(slug);
}

function buildStartCmd({
  slug,
  maxPlayers,
  serverPort,
  queryPort,
  rconHost,
  rconPort,
  rconPassword,
  hostname,
  worldsize,
  seed
}) {
  const parts = [
    "./RustDedicated",
    "-batchmode",
    "-nographics",
    `+server.identity "${slug}"`,
    `+server.port ${serverPort}`,
    queryPort ? `+server.queryport ${queryPort}` : "",
    `+server.level "Procedural Map"`,
    seed ? `+server.seed ${seed}` : "",
    `+server.worldsize ${worldsize}`,
    `+server.maxplayers ${maxPlayers}`,
    `+server.hostname "${hostname}"`,
    `+server.description "Hosted with Rust Panel"`,
    `+rcon.web 1`,
    `+rcon.ip ${rconHost}`,
    `+rcon.port ${rconPort}`,
    `+rcon.password "${rconPassword}"`
  ];
  return parts.filter(Boolean).join(" ");
}

async function createServerWizard(opts) {
  const {
    slug, name, baseDir, modded, memoryMiB, maxPlayers,
    serverPort, queryPort,
    rconHost, rconPort, rconPassword,
    worldsize, seed,
    publicIp, publicPort,
    onLine
  } = opts;

  const serviceName = `rust-${slug}.service`;
  const startCmd = buildStartCmd({
    slug,
    maxPlayers,
    serverPort,
    queryPort,
    rconHost,
    rconPort,
    rconPassword,
    hostname: name,
    worldsize,
    seed
  });

  // Insert into DB
  db.prepare(`
    INSERT INTO servers (
      slug, name, base_dir, start_cmd,
      modded, memory_mib, max_players,
      server_port, query_port,
      rcon_host, rcon_port, rcon_password,
      worldsize, seed,
      public_ip, public_port,
      service_name
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    slug, name, baseDir, startCmd,
    modded ? 1 : 0, memoryMiB || null, maxPlayers,
    serverPort, queryPort || null,
    rconHost, rconPort, rconPassword || null,
    worldsize, seed,
    publicIp || null, publicPort || null,
    serviceName
  );

  // Install server files
  await installServerBundle({ slug, baseDir, modded: !!modded, onLine });

  // Create systemd unit (enabled, Restart=always)
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

async function start(slug) {
  const s = getServerBySlug(slug);
  if (!s) throw new Error("Server not found");
  await startService(s.service_name);
}
async function stop(slug) {
  const s = getServerBySlug(slug);
  if (!s) throw new Error("Server not found");
  await stopService(s.service_name);
}
async function restart(slug) {
  const s = getServerBySlug(slug);
  if (!s) throw new Error("Server not found");
  await restartService(s.service_name);
}

module.exports = { listServers, getServerBySlug, createServerWizard, serverStatus, start, stop, restart };
