const fs = require("fs");
const { spawn } = require("child_process");

function run(cmd,args,{onLine}={}){
  return new Promise((resolve,reject)=>{
    const p = spawn(cmd,args);
    const handle=(b)=>b.toString("utf8").split("\n").filter(Boolean).forEach(l=>onLine?.(l));
    p.stdout.on("data",handle); p.stderr.on("data",handle);
    p.on("error",reject);
    p.on("close",c=>c===0?resolve():reject(new Error(`${cmd} exited ${c}`)));
  });
}

async function ensureSteamcmd({onLine}={}){
  if (fs.existsSync("/usr/games/steamcmd")) return "/usr/games/steamcmd";
  onLine?.("[installer] steamcmd missing; attempting apt install...");
  await run("sudo", ["-n","apt-get","update"], { onLine });
  await run("sudo", ["-n","apt-get","install","-y","steamcmd"], { onLine });
  if (!fs.existsSync("/usr/games/steamcmd")) throw new Error("steamcmd missing at /usr/games/steamcmd");
  return "/usr/games/steamcmd";
}

async function ensureSteamUser(){
  await run("sudo", ["-n","bash","-lc","id steam >/dev/null 2>&1 || useradd -m -s /bin/bash steam"]);
  await run("sudo", ["-n","bash","-lc","mkdir -p /home/steam/.steam /home/steam/Steam && chown -R steam:steam /home/steam/.steam /home/steam/Steam"]);
}

async function installRust({ baseDir, onLine }){
  const steamcmd = await ensureSteamcmd({ onLine });
  await ensureSteamUser();
  await run("sudo", ["-n","bash","-lc", f"mkdir -p '{baseDir}' && chown -R steam:steam '{baseDir}'"], { onLine });
  await run("sudo", ["-n","-u","steam", steamcmd,
    "+force_install_dir", baseDir,
    "+login","anonymous",
    "+app_update","258550","validate",
    "+quit"
  ], { onLine });
  if (!fs.existsSync(f"{baseDir}/RustDedicated")) {
    throw new Error("RustDedicated not found after install (check permissions/baseDir)");
  }
  await run("sudo", ["-n","-u","steam","chmod","+x", f"{baseDir}/RustDedicated"], { onLine });
}

module.exports = { installRust };
