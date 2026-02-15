const pidusage = require("pidusage");
const { db } = require("./db");
const { getMainPID } = require("./systemd");

async function getMetrics(slug) {
  const s = db.prepare("SELECT * FROM servers WHERE slug=?").get(slug);
  if (!s) throw new Error("Server not found");

  const pid = await getMainPID(s.service_name);
  if (!pid) return { running: false, pid: null };

  const stat = await pidusage(pid);
  return { running: true, pid, cpu: stat.cpu, memoryBytes: stat.memory };
}

module.exports = { getMetrics };
