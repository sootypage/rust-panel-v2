const { db } = require("./db");
const { createService, startService, stopService, restartService, statusService } = require("./systemd");

function listServers() {
  return db.prepare(
    "SELECT id, slug, name, base_dir, service_name, rcon_host, rcon_port FROM servers ORDER BY id DESC"
  ).all();
}

function getServerBySlug(slug) {
  return db.prepare("SELECT * FROM servers WHERE slug = ?").get(slug);
}

async function createServer({ slug, name, baseDir, startCmd, rcon }) {
  const serviceName = `rust-${slug}.service`;

  db.prepare(`
    INSERT INTO servers (slug, name, base_dir, start_cmd, rcon_host, rcon_port, rcon_password, service_name)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(slug, name, baseDir, startCmd, rcon?.host || null, rcon?.port || null, rcon?.password || null, serviceName);

  await createService({ slug, baseDir, startCmd });
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

module.exports = { listServers, getServerBySlug, createServer, serverStatus, start, stop, restart };
