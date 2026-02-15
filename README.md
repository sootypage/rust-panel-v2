# Rust Panel v2 (Custom) — v4

Self-hosted Rust server panel with:
- Users + login + roles
- Dashboard + Create Server + Server page + Settings + Account + **File Manager**
- Create Server wizard: installs RustDedicated (SteamCMD), optional uMod, creates **systemd unit per server**
- CPU/RAM stats per server + player count via RCON
- File Manager: browse + edit configs + upload plugins (.cs)
- Discord webhook: periodic server stats posts
- HTTPS + domain support (Nginx example)

> Keep this repo **private** if you store secrets (RCON passwords, Playit token, webhook URLs).

## Requirements
- Ubuntu 22.04+
- Node.js **20+**
- sudo access
- steamcmd + unzip
- a `steam` user

## One-time host prep
```bash
sudo useradd -m -s /bin/bash steam || true
sudo mkdir -p /srv/rust
sudo chown -R steam:steam /srv/rust
sudo apt update
sudo apt install -y steamcmd unzip
```
steamcmd is usually at `/usr/games/steamcmd`.

## Install & run
```bash
git clone https://github.com/sootypage/rust-panel-v2.git
cd rust-panel-v2
cp .env.example .env
npm install
node src/index.js
```
Open: `http://SERVER-IP:3000/login.html`

## Create first admin user
```bash
node - <<'NODE'
const bcrypt = require("bcrypt");
const { db } = require("./src/db");
db.prepare("INSERT OR IGNORE INTO users (username, password_hash, role) VALUES (?,?,?)")
  .run("admin", bcrypt.hashSync("CHANGE_ME", 12), "admin");
console.log("Created admin");
NODE
```

## Create Server fields
- slug, name
- modded (uMod)
- RAM limit (MiB) → systemd `MemoryMax=`
- max players
- map size (worldsize), optional seed
- server port + rcon port + rcon password
- public IP + public port (what players connect to)
- Playit.gg: enable + endpoint + token field (stored in DB)

### Playit auto-setup note
This build stores the Playit token & endpoint and shows the endpoint in the UI. Full automatic tunnel creation is left as a safe/manual step (paste the endpoint you get from Playit).

## HTTPS / Domain
Use `docs/nginx-example.conf` and add TLS via Certbot/Cloudflare.


## Quick install (Ubuntu)

```bash
sudo ./setup.sh
cp .env.example .env
npm install
node src/index.js
```

By default the panel binds to **0.0.0.0** (all interfaces) on port **3000**.


## One-command setup

```bash
npm run setup
```

This runs `setup.sh` with sudo and installs Node 20 + steamcmd + creates the steam user.
