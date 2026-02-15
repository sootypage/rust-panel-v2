const path = require("path");
const { exec } = require("child_process");
const { getServerBySlug } = require("./servers");

function sh(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout.trim());
    });
  });
}

async function createBackup(slug) {
  const s = getServerBySlug(slug);
  if (!s) throw new Error("Server not found");

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const out = path.join(process.cwd(), "backups", `${slug}-${stamp}.tar.gz`);

  const cmd = `tar -czf "${out}" -C "${s.base_dir}" . --exclude="./logs"`;
  await sh(cmd);
  return { file: path.basename(out), path: out };
}

module.exports = { createBackup };
