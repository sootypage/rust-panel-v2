const fs = require("fs");
const path = require("path");
const { run } = require("./util_run");

// By default we use *user* systemd units so the panel doesn't need sudo.
// - SYSTEMD_MODE=user  -> systemctl --user (recommended)
// - SYSTEMD_MODE=root  -> sudo systemctl (requires NOPASSWD sudoers)
const SYSTEMD_MODE = (process.env.SYSTEMD_MODE || "user").toLowerCase();

function unitName(slug){
  return `sootypage-${slug}.service`;
}

function userUnitPath(slug){
  const home = process.env.HOME || ".";
  return path.join(home, ".config", "systemd", "user", unitName(slug));
}

function rootUnitPath(slug){
  return path.join("/etc/systemd/system", unitName(slug));
}

async function tryEnableLinger({ onLine } = {}){
  // Needed for --user units to keep running after logout.
  // If it fails (no sudo), we just warn; servers still run while you're logged in.
  const user = process.env.USER || "";
  if(!user) return;
  try{
    await run("sudo", ["-n", "loginctl", "enable-linger", user], { onLine });
    onLine?.(`[systemd] Enabled linger for ${user}`);
  }catch{
    onLine?.(`[systemd] NOTE: couldn't enable linger (no sudo). For 24/7 servers run:`);
    onLine?.(`         sudo loginctl enable-linger ${user}`);
  }
}

async function systemctl(args, { onLine } = {}){
  if (SYSTEMD_MODE === "root"){
    // Requires sudoers NOPASSWD for systemctl + cat to /etc/systemd/system.
    return run("sudo", ["-n", "systemctl", ...args], { onLine });
  }
  // user mode
  return run("systemctl", ["--user", ...args], { onLine });
}

async function daemonReload({ onLine } = {}){
  await systemctl(["daemon-reload"], { onLine });
}

function makeStartScript({ slug, game, base_dir, server_port, query_port, rcon_host, rcon_port, rcon_password, worldsize, seed, maxplayers, modded }){
  const safe = (s)=>String(s).replace(/"/g,'\\"');

  if (game === "minecraft"){
    // Paper uses Java; memory is handled by the create form via JAVA_XMS/JAVA_XMX in the script.
    const jar = path.join(base_dir, "paper.jar");
    const xms = process.env.MC_JAVA_XMS || "1G";
    const xmx = process.env.MC_JAVA_XMX || "2G";
    return `#!/usr/bin/env bash\nset -euo pipefail\ncd "${safe(base_dir)}"\nexec java -Xms${safe(xms)} -Xmx${safe(xmx)} -jar "${safe(jar)}" nogui\n`;
  }

  // Rust
  // Keep quotes for Procedural Map.
  return `#!/usr/bin/env bash\nset -euo pipefail\ncd "${safe(base_dir)}"\nexec ./RustDedicated -batchmode -nographics \\n+  +server.identity "${safe(slug)}" \\n+  +server.port ${Number(server_port)||28015} \\n+  +server.queryport ${Number(query_port)||28017} \\n+  +server.level "Procedural Map" \\n+  +server.seed ${Number(seed)||0} \\n+  +server.worldsize ${Number(worldsize)||3500} \\n+  +server.maxplayers ${Number(maxplayers)||50} \\n+  +rcon.web 1 \\n+  +rcon.ip "${safe(rcon_host||'127.0.0.1')}" \\n+  +rcon.port ${Number(rcon_port)||28016} \\n+  +rcon.password "${safe(rcon_password||'')}" \\n+  +server.hostname "${safe(slug)}" \\n+  +server.description "Hosted with Sootypage Game Panel"\n`;
}

async function writeFileAsRoot(destPath, content, { onLine } = {}){
  // Write with sudo, using a heredoc. This avoids shell escaping issues.
  const cmd = `cat > '${destPath}' <<'UNIT'\n${content}\nUNIT`;
  await run("sudo", ["-n","bash","-lc", cmd], { onLine });
}

async function createService(serverRow, { onLine } = {}){
  const slug = serverRow.slug;
  const base_dir = serverRow.base_dir;

  // Start script lives in panel data/ so we can regenerate it without touching the game folder.
  const scriptsDir = path.join(process.cwd(), "data", "scripts");
  fs.mkdirSync(scriptsDir, { recursive: true });
  const scriptPath = path.join(scriptsDir, `${slug}.sh`);
  fs.writeFileSync(scriptPath, makeStartScript(serverRow), "utf8");
  fs.chmodSync(scriptPath, 0o755);

  const unit = `[Unit]\nDescription=Sootypage ${serverRow.game||'rust'} Server (${slug})\nAfter=network.target\n\n[Service]\nType=simple\nWorkingDirectory=${base_dir}\nExecStart=${scriptPath}\nRestart=on-failure\nRestartSec=5\n\n[Install]\nWantedBy=default.target\n`;

  if (SYSTEMD_MODE === "root"){
    const unitPath = rootUnitPath(slug);
    await writeFileAsRoot(unitPath, unit, { onLine });
    await systemctl(["daemon-reload"], { onLine });
    await systemctl(["enable", unitName(slug)], { onLine });
    return;
  }

  // user mode
  await tryEnableLinger({ onLine });
  const unitPath = userUnitPath(slug);
  fs.mkdirSync(path.dirname(unitPath), { recursive: true });
  fs.writeFileSync(unitPath, unit, "utf8");
  await daemonReload({ onLine });
  await systemctl(["enable", "--now", unitName(slug)], { onLine });
}

async function start(slug, { onLine } = {}){
  await systemctl(["start", unitName(slug)], { onLine });
}

async function stop(slug, { onLine } = {}){
  await systemctl(["stop", unitName(slug)], { onLine });
}

async function restart(slug, { onLine } = {}){
  await systemctl(["restart", unitName(slug)], { onLine });
}

async function status(slug, { onLine } = {}){
  // "is-active" exit code non-zero when inactive, so we must not throw.
  try{
    await systemctl(["is-active", "--quiet", unitName(slug)], { onLine });
    return true;
  }catch{
    return false;
  }
}

async function mainPid(slug){
  // Try to get a MainPID. If it fails, return 0.
  try{
    const out = await run(
      SYSTEMD_MODE === "root" ? "sudo" : "systemctl",
      SYSTEMD_MODE === "root" ? ["-n", "systemctl", "show", "-p", "MainPID", "--value", unitName(slug)] : ["--user", "show", "-p", "MainPID", "--value", unitName(slug)],
      { capture: true }
    );
    const pid = Number(String(out).trim() || 0);
    return Number.isFinite(pid) ? pid : 0;
  }catch{
    return 0;
  }
}

module.exports = {
  unitName,
  createService,
  start,
  stop,
  restart,
  status,
  mainPid,
  SYSTEMD_MODE,
};
