const fs = require("fs");
const path = require("path");
const https = require("https");
const { execSync } = require("child_process");
const { spawn } = require("child_process");

const DATA_DIR = path.join(process.cwd(), "data");
const DOWNLOADS_DIR = path.join(DATA_DIR, "downloads");
const INSTALL_LOG_DIR = path.join(DATA_DIR, "install-logs");

function run(cmd, args, { onLine, cwd, env } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, env: { ...process.env, ...(env || {}) } });

    const handle = (b) =>
      b
        .toString("utf8")
        .split("\n")
        .filter(Boolean)
        .forEach((l) => onLine?.(l));

    p.stdout.on("data", handle);
    p.stderr.on("data", handle);

    p.on("error", reject);
    p.on("close", (c) => (c === 0 ? resolve() : reject(new Error(`${cmd} exited ${c}`))));
  });
}

function ensureDirWritable(dir, onLine) {
  fs.mkdirSync(dir, { recursive: true });
  const probe = path.join(dir, `.write-test-${Date.now()}`);
  try {
    fs.writeFileSync(probe, "ok");
    fs.unlinkSync(probe);
  } catch (e) {
    // Try to fix using sudo (NOPASSWD recommended)
    try {
      onLine?.(`[installer] No write permission for ${dir}. Trying sudo to create/chown...`);
      execSync(`sudo -n bash -lc "mkdir -p '${dir}' && chown -R $(id -u):$(id -g) '${dir}'"`, { stdio: "ignore" });
    } catch {}

    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(probe, "ok");
      fs.unlinkSync(probe);
      return;
    } catch {
      throw new Error(
        `No write permission for ${dir}. Use a writable GAME_ROOT (recommended) or fix permissions. Example: set GAME_ROOT=$HOME/game-servers in .env.`
      );
    }
  }
}

function httpsGetJson(url){
  return new Promise((resolve,reject)=>{
    https.get(url,(res)=>{
      let data="";
      res.on("data",(c)=>data+=c);
      res.on("end",()=>{
        if(res.statusCode!==200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        try{ resolve(JSON.parse(data)); }catch(e){ reject(new Error(`Bad JSON from ${url}`)); }
      });
    }).on("error",reject);
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
        try {
          fs.unlinkSync(dest);
        } catch {}
        reject(err);
      });
  });
}

async function ensureSteamcmd({ onLine } = {}) {
  const steamcmd = "/usr/games/steamcmd";
  if (fs.existsSync(steamcmd)) return steamcmd;

  onLine?.("[installer] steamcmd missing. Trying sudo apt-get install steamcmd...");
  try {
    await run("sudo", ["-n", "apt-get", "update"], { onLine });
    await run("sudo", ["-n", "apt-get", "install", "-y", "steamcmd"], { onLine });
  } catch {
    // ignore; we'll throw below
  }

  if (!fs.existsSync(steamcmd)) {
    throw new Error("steamcmd not found at /usr/games/steamcmd. Install it with: sudo apt-get install steamcmd");
  }
  return steamcmd;
}

async function ensureUnzip({ onLine } = {}) {
  try {
    await run("bash", ["-lc", "command -v unzip >/dev/null 2>&1"], { onLine });
    return;
  } catch {}

  onLine?.("[installer] unzip missing. Trying sudo apt-get install unzip...");
  try {
    await run("sudo", ["-n", "apt-get", "update"], { onLine });
    await run("sudo", ["-n", "apt-get", "install", "-y", "unzip"], { onLine });
  } catch {}

  try {
    await run("bash", ["-lc", "command -v unzip >/dev/null 2>&1"], { onLine });
  } catch {
    throw new Error("unzip not found. Install it with: sudo apt-get install unzip");
  }
}

function findRustDedicated(baseDir) {
  const direct = path.join(baseDir, "RustDedicated");
  if (fs.existsSync(direct)) return direct;

  // fallback: search 2 levels deep
  const stack = [baseDir];
  let depth = 0;
  while (stack.length && depth < 3) {
    const cur = stack.shift();
    const items = fs.readdirSync(cur, { withFileTypes: true });
    for (const it of items) {
      const fp = path.join(cur, it.name);
      if (it.isFile() && it.name === "RustDedicated") return fp;
      if (it.isDirectory()) stack.push(fp);
    }
    depth++;
  }
  return null;
}

async function installRust({ baseDir, onLine } = {}) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
  fs.mkdirSync(INSTALL_LOG_DIR, { recursive: true });

  ensureDirWritable(baseDir, onLine);

  const steamcmd = await ensureSteamcmd({ onLine });

  // Make sure steamcmd has a writable HOME so it can create its cache
  const env = { HOME: process.env.HOME || process.cwd() };

  onLine?.(`[installer] Installing Rust Dedicated to ${baseDir}`);
  await run(
    steamcmd,
    ["+force_install_dir", baseDir, "+login", "anonymous", "+app_update", "258550", "validate", "+quit"],
    { onLine, env }
  );

  const exe = findRustDedicated(baseDir);
  if (!exe) {
    const ls = fs.readdirSync(baseDir).slice(0, 50).join(", ");
    throw new Error(`RustDedicated not found after install. baseDir contains: ${ls}`);
  }

  try {
    fs.chmodSync(exe, 0o755);
  } catch {
    // ignore
  }

  onLine?.("[installer] Rust Dedicated installed OK");
}

async function installPaper({ baseDir, version, jarName, ramMb, maxPlayers, port, motd, onLine } = {}) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
  fs.mkdirSync(INSTALL_LOG_DIR, { recursive: true });

  ensureDirWritable(baseDir, onLine);

  const project = "paper";
  const meta = await httpsGetJson(`https://api.papermc.io/v2/projects/${project}`);
  const chosenVersion = version || meta.versions?.[meta.versions.length - 1];
  if(!chosenVersion) throw new Error("Could not determine Paper version");
  const verMeta = await httpsGetJson(`https://api.papermc.io/v2/projects/${project}/versions/${chosenVersion}`);
  const build = verMeta.builds?.[verMeta.builds.length - 1];
  if(!build) throw new Error("Could not determine Paper build");
  const buildMeta = await httpsGetJson(`https://api.papermc.io/v2/projects/${project}/versions/${chosenVersion}/builds/${build}`);
  const jar = jarName || buildMeta.downloads?.application?.name || `paper-${chosenVersion}.jar`;
  const url = `https://api.papermc.io/v2/projects/${project}/versions/${chosenVersion}/builds/${build}/downloads/${jar}`;

  // Normalize to server.jar so systemd/start scripts can be generic.
  const targetJar = jarName || "server.jar";
  const jarPath = path.join(baseDir, targetJar);
  await download(url, jarPath, onLine);

  // Basic config
  fs.writeFileSync(path.join(baseDir, "eula.txt"), "eula=true\n");
  const props = [
    `server-port=${Number(port||25565)}`,
    `max-players=${Number(maxPlayers||20)}`,
    "enable-rcon=false",
    `motd=${String(motd||"Sootypage Game Panel").replace(/\n/g," ")}`,
  ].join("\n") + "\n";
  fs.writeFileSync(path.join(baseDir, "server.properties"), props);

  const startSh = `#!/usr/bin/env bash\nset -e\ncd \"$(dirname \"$0\")\"\nRAM=${Number(ramMb||4096)}\njava -Xms${Number(ramMb||4096)}M -Xmx${Number(ramMb||4096)}M -jar \"${targetJar}\" nogui\n`;
  fs.writeFileSync(path.join(baseDir, "start.sh"), startSh);
  try{ fs.chmodSync(path.join(baseDir,"start.sh"), 0o755); }catch{}

  onLine?.(`[installer] Paper installed OK (${chosenVersion} build ${build})`);
}

// ---- Fabric (vanilla + mods via Fabric Loader)
async function installFabric({ baseDir, version, loaderVersion, installerVersion, ramMb, maxPlayers, port, motd, onLine } = {}){
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
  fs.mkdirSync(INSTALL_LOG_DIR, { recursive: true });

  ensureDirWritable(baseDir, onLine);

  // Pick latest stable versions when not provided.
  const mcVer = (version && version !== "latest") ? String(version) : null;
  if(!mcVer){
    // Use official launcher manifest to pick the latest release.
    const manifest = await httpsGetJson("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json");
    const latest = manifest?.latest?.release;
    if(!latest) throw new Error("Could not determine latest Minecraft version");
    version = latest;
  }

  const loaderMeta = await httpsGetJson("https://meta.fabricmc.net/v2/versions/loader");
  const latestLoader = loaderMeta?.[0]?.version;
  const loader = loaderVersion || latestLoader;
  if(!loader) throw new Error("Could not determine Fabric loader version");

  const installerMeta = await httpsGetJson("https://meta.fabricmc.net/v2/versions/installer");
  const latestInstaller = installerMeta?.[0]?.version;
  const installer = installerVersion || latestInstaller;
  if(!installer) throw new Error("Could not determine Fabric installer version");

  const url = `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(version)}/${encodeURIComponent(loader)}/${encodeURIComponent(installer)}/server/jar`;
  const targetJar = "server.jar";
  const jarPath = path.join(baseDir, targetJar);
  await download(url, jarPath, onLine);

  fs.writeFileSync(path.join(baseDir, "eula.txt"), "eula=true\n");
  const props = [
    `server-port=${Number(port||25565)}`,
    `max-players=${Number(maxPlayers||20)}`,
    "enable-rcon=false",
    `motd=${String(motd||"Sootypage Game Panel").replace(/\n/g," ")}`,
  ].join("\n") + "\n";
  fs.writeFileSync(path.join(baseDir, "server.properties"), props);

  const startSh = `#!/usr/bin/env bash\nset -e\ncd \"$(dirname \"$0\")\"\nRAM=${Number(ramMb||4096)}\njava -Xms${Number(ramMb||4096)}M -Xmx${Number(ramMb||4096)}M -jar \"${targetJar}\" nogui\n`;
  fs.writeFileSync(path.join(baseDir, "start.sh"), startSh);
  try{ fs.chmodSync(path.join(baseDir,"start.sh"), 0o755); }catch{}

  onLine?.(`[installer] Fabric installed OK (MC ${version}, loader ${loader}, installer ${installer})`);
}

// ---- Forge (modded)
async function installForge({ baseDir, version, forgeVersion, ramMb, maxPlayers, port, motd, onLine } = {}){
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
  fs.mkdirSync(INSTALL_LOG_DIR, { recursive: true });

  ensureDirWritable(baseDir, onLine);

  // Determine MC version (latest release if not provided)
  if(!version || version === "latest"){
    const manifest = await httpsGetJson("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json");
    const latest = manifest?.latest?.release;
    if(!latest) throw new Error("Could not determine latest Minecraft version");
    version = latest;
  }

  // Determine Forge build for that MC version
  let forge = forgeVersion;
  if(!forge){
    // Forge promotions JSON maps MC version -> recommended/latest Forge build numbers
    const promos = await httpsGetJson("https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json");
    forge = promos?.promos?.[`${version}-recommended`] || promos?.promos?.[`${version}-latest`];
  }
  if(!forge) throw new Error(`Could not determine Forge version for MC ${version}`);

  const artifactVersion = `${version}-${forge}`;
  const installerJar = `forge-${artifactVersion}-installer.jar`;
  const url = `https://maven.minecraftforge.net/net/minecraftforge/forge/${artifactVersion}/${installerJar}`;
  const installerPath = path.join(baseDir, installerJar);
  await download(url, installerPath, onLine);

  fs.writeFileSync(path.join(baseDir, "eula.txt"), "eula=true\n");
  const props = [
    `server-port=${Number(port||25565)}`,
    `max-players=${Number(maxPlayers||20)}`,
    "enable-rcon=false",
    `motd=${String(motd||"Sootypage Game Panel").replace(/\n/g," ")}`,
  ].join("\n") + "\n";
  fs.writeFileSync(path.join(baseDir, "server.properties"), props);

  // Run the Forge installer to generate libraries + run scripts.
  onLine?.(`[installer] Running Forge installer (${artifactVersion})...`);
  await run("java", ["-jar", installerPath, "--installServer"], { onLine, cwd: baseDir });

  // Create a generic start.sh that prefers Forge's run.sh if present.
  const startSh = `#!/usr/bin/env bash\nset -e\ncd \"$(dirname \"$0\")\"\nRAM=${Number(ramMb||4096)}\nif [ -f ./run.sh ]; then\n  chmod +x ./run.sh || true\n  exec ./run.sh nogui\nfi\n# Fallback: try to run the generated forge server jar\nJAR=$(ls -1 forge-*.jar 2>/dev/null | head -n 1 || true)\nif [ -z \"$JAR\" ]; then\n  echo \"[forge] Could not find forge server jar\" >&2\n  exit 1\nfi\nexec java -Xms${Number(ramMb||4096)}M -Xmx${Number(ramMb||4096)}M -jar \"$JAR\" nogui\n`;
  fs.writeFileSync(path.join(baseDir, "start.sh"), startSh);
  try{ fs.chmodSync(path.join(baseDir,"start.sh"), 0o755); }catch{}

  onLine?.(`[installer] Forge installed OK (MC ${version}, Forge ${forge})`);
}

async function installUMod({ baseDir, onLine } = {}) {
  await ensureUnzip({ onLine });

  const url = "https://umod.org/games/rust/download";
  const zipPath = path.join(DOWNLOADS_DIR, `umod-rust-${Date.now()}.zip`);
  await download(url, zipPath, onLine);

  onLine?.("[installer] Extracting uMod/Oxide...");
  await run("unzip", ["-o", zipPath, "-d", baseDir], { onLine });

  onLine?.("[installer] uMod installed OK");
}

module.exports = { INSTALL_LOG_DIR, installRust, installUMod, installPaper, installFabric, installForge };
