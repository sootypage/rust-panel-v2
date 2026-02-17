const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const env = path.join(root, ".env");
const example = path.join(root, ".env.example");

function sh(cmd){
  return spawnSync("bash", ["-lc", cmd], { stdio: "inherit" });
}

function has(cmd){
  return spawnSync("bash", ["-lc", `command -v ${cmd} >/dev/null 2>&1`], { stdio: "ignore" }).status === 0;
}

function ensureEnv(){
  try{
    if(!fs.existsSync(env) && fs.existsSync(example)){
      fs.copyFileSync(example, env);
      console.log("[panel] Created .env from .env.example");
    }
  }catch(e){
    console.warn("[panel] postinstall: could not create .env:", e.message||e);
  }
}

function warnNodeVersion(){
  const major = Number(String(process.versions.node||"0").split(".")[0]);
  if(major < 20){
    console.log("\n[panel] ⚠️ Node.js 20+ is recommended. Your version:", process.versions.node);
    console.log("[panel] Install Node 20+ (Ubuntu):");
    console.log("  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -");
    console.log("  sudo apt-get install -y nodejs\n");
  }
}

function ensureJava(){
  if(has("java")){
    console.log("[panel] Java detected ✔");
    return;
  }

  console.log("\n[panel] Java not found. Minecraft (Paper) needs Java.");
  console.log("[panel] Trying to install Java using passwordless sudo (sudo -n)...");

  const r0 = sh("sudo -n apt-get update");
  if(r0.status !== 0){
    console.log("\n[panel] Could not use sudo without a password.");
    console.log("[panel] Install Java manually:");
    console.log("  sudo apt-get update");
    console.log("  sudo apt-get install -y openjdk-21-jre-headless || sudo apt-get install -y openjdk-17-jre-headless\n");
    return;
  }

  // Try Java 21 first (newer Minecraft), then fall back to 17.
  sh("sudo -n apt-get install -y openjdk-21-jre-headless || true");
  sh("sudo -n apt-get install -y openjdk-17-jre-headless || true");

  console.log(has("java") ? "[panel] Java installed ✔" : "[panel] Java still missing (install manually)." );
}

ensureEnv();
ensureJava();
warnNodeVersion();
