# Rust Panel v2 (Custom)

A simple self-hosted Rust server panel:
- Login + roles
- Dashboard / Create Server / Settings / Account pages
- Create Server wizard installs RustDedicated automatically (SteamCMD) and optional uMod (Oxide)
- systemd unit per server + log tailing
- Basic metrics endpoint (CPU/RAM via pidusage) (graphs can be added)

> **Note about WSL2:** RustDedicated can be unstable on WSL2. For best results run on a real Linux VPS/bare metal.

## Requirements
- Ubuntu 22.04+ (recommended)
- Node.js **20+**
- `sudo` access
- `steamcmd` and `unzip` installed
- A `steam` user (the installer will use it)

## Quick start
```bash
git clone https://github.com/<YOU>/rust-panel-v2.git
cd rust-panel-v2
cp .env.example .env
npm install
node src/index.js
```
Open:
- http://SERVER-IP:3000/login.html

## Create first admin user
Run from the project folder:
```bash
node - <<'NODE'
const bcrypt = require("bcrypt");
const { db } = require("./src/db");
const username = "admin";
const password = "CHANGE_ME";
const role = "admin";
const hash = bcrypt.hashSync(password, 12);
db.prepare("INSERT OR IGNORE INTO users (username, password_hash, role) VALUES (?,?,?)")
  .run(username, hash, role);
console.log("Created admin:", username);
NODE
```

## One-time server prep (recommended)
Create the steam user and base directory:
```bash
sudo useradd -m -s /bin/bash steam || true
sudo mkdir -p /srv/rust
sudo chown -R steam:steam /srv/rust
sudo apt update
sudo apt install -y steamcmd unzip
```

On Ubuntu, steamcmd is usually at `/usr/games/steamcmd`.

## Create Server wizard
In **Create Server** page you set:
- slug (example `main`)
- name
- modded (uMod/Oxide) toggle
- RAM limit (MiB) -> systemd `MemoryMax=`
- max players
- server port / rcon port / rcon password

The panel will:
1) Install RustDedicated into `/srv/rust/<slug>` with SteamCMD
2) Optionally install uMod (Oxide) into the same folder
3) Create a systemd service `rust-<slug>.service` and enable it

## Run panel 24/7 (PM2)
```bash
sudo npm i -g pm2
pm2 start src/index.js --name rust-panel
pm2 save
pm2 startup
```
Run the command PM2 prints.

## Reverse proxy + HTTPS (Nginx)
See `docs/nginx-example.conf` for a basic config. Put Cloudflare/Nginx in front and keep the panel on 127.0.0.1:3000.

## Updating
```bash
git pull
pm2 restart rust-panel
```

## Safety
- Do **not** commit `.env`, `data/`, `backups/` or `uploads/` (already in `.gitignore`)
- Use a strong `JWT_SECRET`
