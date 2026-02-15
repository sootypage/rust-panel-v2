const pidusage = require("pidusage");
const { getServerBySlug } = require("./servers");
const { getMainPID } = require("./systemd");

async function getMetrics(slug) {
  const s = getServerBySlug(slug);
  if (!s) throw new Error("Server not found");

  const pid = await getMainPID(s.service_name);
  if (!pid) return { running: false };

  const stat = await pidusage(pid);
  return {
    running: true,
    pid,
    cpu: stat.cpu,
    memoryBytes: stat.memory
  };
}

module.exports = { getMetrics };
