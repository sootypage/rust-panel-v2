const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const https = require("https");

const INSTALL_LOG_DIR = path.join(process.cwd(), "data", "install-logs");
fs.mkdirSync(INSTALL_LOG_DIR, { recursive: true });

function createInstallLogger(slug) {
  const file = path.join(INSTALL_LOG_DIR, `${slug}-${Date.now()}.log`);
  const stream = fs.createWriteStream(file, { flags: "a" });
  const log = (line) => {
    try { stream.write(String(line) + "\n"); } catch {}
  };
  const close = () => { try { stream.end(); } catch {} };
  return { file, log, close };
}

function run(cmd, args, { cwd, onLine, env } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, {
      cwd,
      env: { ...process.env, ...(env || {}) },
    });

    const handle = (buf) => {
      const s = buf.toString("utf8");
      s.split("\n").filter(Boolean).forEach((line) => onLine?.(line));
    };

    p.stdout.on("data", handle);
    p.stderr.on("data", handle);

    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`))));
  });
}

function download(url, dest, onLine) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const file = fs.createWriteStream(dest);
    onLine?.(`[installer] Downloading: ${url}`);

    https
      .get(url, (res) => {
        if (res.statusCode !== 200) return reject(new Error(`Download failed: ${res.statusCode}`));
        res.pipe(file);
        file.on("finish", () => file.close(resolve));
      })
      .on("error", (err) => {
        try { fs.unlinkSync(dest); } catch {}
        reject(err);
      });
  });
}

async function installRustDedicated({ baseDir, onLine }) {
  const steamcmd = "/usr/games/steamcmd";
  if (!fs.existsSync(steamcmd)) throw new Error("steamcmd not found at /usr/games/steamcmd. Install with: sudo apt install steamcmd");

  fs.mkdirSync(baseDir, { recursive: true });

  // Use sudo -n so it fails fast if sudoers isn't configured
  await run(
    "sudo",
    ["-n", "-u", "steam", steamcmd, "+force_install_dir", baseDir, "+login", "anonymous", "+app_update", "258550", "validate", "+quit"],
    { onLine }
  );

  const exe = path.join(baseDir, "RustDedicated");
  if (!fs.existsSync(exe)) throw new Error("RustDedicated not found after install");
  await run("sudo", ["-n", "-u", "steam", "chmod", "+x", exe], { onLine });
}

async function installUMod({ baseDir, onLine }) {
  const url = "https://umod.org/games/rust/download";
  const zipPath = path.join(process.cwd(), "uploads", `umod-rust-${Date.now()}.zip`);
  await download(url, zipPath, onLine);

  // unzip must exist on host
  await run("sudo", ["-n", "-u", "steam", "unzip", "-o", zipPath, "-d", baseDir], { onLine });
  try { fs.unlinkSync(zipPath); } catch {}
}

// High-level install used by Create Server
async function installServerBundle({ slug, baseDir, modded, onLine }) {
  const logger = createInstallLogger(slug || "server");
  const line = (s) => {
    logger.log(s);
    onLine?.(s);
  };

  try {
    line(`[installer] Log file: ${logger.file}`);
    await installRustDedicated({ baseDir, onLine: line });
    if (modded) await installUMod({ baseDir, onLine: line });
    line("[installer] Install complete");
    return { logFile: logger.file };
  } finally {
    logger.close();
  }
}

module.exports = { installRustDedicated, installUMod, installServerBundle };
