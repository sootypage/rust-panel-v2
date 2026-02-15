// src/backups.js
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

function sh(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout.trim());
    });
  });
}

async function createBackup(slug, baseDir) {
  const backupsDir = path.join(process.cwd(), "backups", slug);
  fs.mkdirSync(backupsDir, { recursive: true });
  const name = `${slug}-${Date.now()}.tar.gz`;
  const out = path.join(backupsDir, name);
  await sh(`tar -czf "${out}" -C "${baseDir}" .`);
  return { file: out, name };
}

module.exports = { createBackup };
