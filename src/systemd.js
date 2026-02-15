const { exec } = require("child_process");

function sh(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout.trim());
    });
  });
}

async function createService({ slug, baseDir, startCmd, memoryMiB }) {
  const serviceName = `rust-${slug}.service`;
  const unitPath = `/etc/systemd/system/${serviceName}`;
  const memLine = memoryMiB ? `MemoryMax=${memoryMiB}M` : "";

  const unit = `
[Unit]
Description=Rust Server (${slug})
After=network.target

[Service]
Type=simple
WorkingDirectory=${baseDir}
${memLine}
ExecStart=/bin/bash -lc '${startCmd.replace(/'/g, `'\\\\''`)}'
Restart=always
RestartSec=5
User=steam
Group=steam
LimitNOFILE=100000
KillSignal=SIGINT
TimeoutStopSec=30
StandardOutput=append:${baseDir}/logs/console.log
StandardError=append:${baseDir}/logs/console.log

[Install]
WantedBy=multi-user.target
`.trim();

  await sh(`sudo mkdir -p "${baseDir}/logs"`);
  const escaped = unit.replace(/"/g, '\\"');
  await sh(`printf %s "${escaped}" | sudo tee "${unitPath}" >/dev/null`);
  await sh(`sudo systemctl daemon-reload`);
  await sh(`sudo systemctl enable "${serviceName}"`);
  return { serviceName };
}

async function startService(serviceName) { await sh(`sudo systemctl start "${serviceName}"`); }
async function stopService(serviceName) { await sh(`sudo systemctl stop "${serviceName}"`); }
async function restartService(serviceName) { await sh(`sudo systemctl restart "${serviceName}"`); }
async function statusService(serviceName) { try { await sh(`systemctl is-active --quiet "${serviceName}"`); return true; } catch { return false; } }
async function getMainPID(serviceName) {
  try {
    const pid = await sh(`systemctl show -p MainPID --value "${serviceName}"`);
    const n = parseInt(pid, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch { return null; }
}

module.exports = { createService, startService, stopService, restartService, statusService, getMainPID };
