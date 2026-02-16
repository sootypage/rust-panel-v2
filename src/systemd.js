const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

function run(cmd, args, { onLine } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    const handle = (b) => b.toString("utf8").split("\n").filter(Boolean).forEach(l => onLine?.(l));
    p.stdout.on("data", handle);
    p.stderr.on("data", handle);
    p.on("error", reject);
    p.on("close", c => c === 0 ? resolve() : reject(new Error(`${cmd} exited ${c}`)));
  });
}

function serviceName(slug){ return `panel-${slug}.service`; }
function safe(x){ return String(x ?? "").replace(/"/g,""); }

async function writeStartScript(s){
  const fp = path.join(s.base_dir, "start.sh");
  fs.mkdirSync(s.base_dir, { recursive:true });
  const cmd = [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    `cd "${s.base_dir}"`,
    "exec ./RustDedicated -batchmode -nographics \\",
    `  +server.identity "${safe(s.slug)}" \\`,
    `  +server.port ${Number(s.server_port)} \\`,
    `  +server.queryport ${Number(s.query_port)} \\`,
    `  +server.level "${safe(s.level||"Procedural Map")}" \\`,
    (Number(s.seed)?`  +server.seed ${Number(s.seed)} \\`:""),
    (Number(s.worldsize)?`  +server.worldsize ${Number(s.worldsize)} \\`:""),
    `  +rcon.ip ${safe(s.rcon_host||"127.0.0.1")} \\`,
    `  +rcon.port ${Number(s.rcon_port)} \\`,
    `  +rcon.password "${safe(s.rcon_password||"")}" \\`,
    `  +server.hostname "${safe(s.name||s.slug)}" \\`,
    `  +server.description "Hosted with Rust Panel Next" \\`,
    `  +server.maxplayers ${Number(s.maxplayers||50)}`
  ].filter(Boolean).join("\n") + "\n";
  fs.writeFileSync(fp, cmd, { mode:0o755 });
  return fp;
}

async function createService(s, { onLine } = {}){
  const unitPath = `/etc/systemd/system/${serviceName(s.slug)}`;
  const startPath = await writeStartScript(s);
  const unit = [
    "[Unit]",
    `Description=Rust Server (${s.slug})`,
    "After=network.target",
    "",
    "[Service]",
    "Type=simple",
    "User=steam",
    `WorkingDirectory=${s.base_dir}`,
    `ExecStart=/usr/bin/env bash ${startPath}`,
    "Restart=always",
    "RestartSec=5",
    "KillSignal=SIGINT",
    "TimeoutStopSec=60",
    "",
    "[Install]",
    "WantedBy=multi-user.target",
    ""
  ].join("\n");
  await run("sudo", ["-n","bash","-lc", f"cat > {unitPath} <<'UNIT'\n{unit}\nUNIT"], { onLine });
  await run("sudo", ["-n","systemctl","daemon-reload"], { onLine });
  await run("sudo", ["-n","systemctl","enable", serviceName(s.slug)], { onLine });
}

async function start(slug){ await run("sudo", ["-n","systemctl","start", serviceName(slug)]); }
async function stop(slug){ await run("sudo", ["-n","systemctl","stop", serviceName(slug)]); }
async function restart(slug){ await run("sudo", ["-n","systemctl","restart", serviceName(slug)]); }

async function mainPid(slug){
  return await new Promise((resolve)=>{
    const p = spawn("sudo", ["-n","systemctl","show", serviceName(slug), "--property=MainPID", "--value"]);
    let out="";
    p.stdout.on("data",(b)=>out+=b.toString("utf8"));
    p.on("close",()=>resolve(Number(out.trim()||0)));
  });
}

module.exports = { serviceName, createService, start, stop, restart, mainPid };
