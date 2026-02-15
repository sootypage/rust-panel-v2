# rust-panel-v2

A lightweight self-hosted Rust server panel (Node.js + SQLite) with:
- Login + roles (`admin`, `owner`, `user`)
- Create server from UI (no JSON edits)
- Systemd units per server (24/7 with auto-restart)
- Live console log + basic CPU/RAM stats
- File manager (browse/edit/upload)
- Backups (create + download)
- Optional uMod install for modded servers

> **Security note:** This panel uses `sudo` to run `steamcmd` as the `steam` user and to start/stop `rust-*.service` units. Follow the sudoers instructions below carefully.

## Requirements
- Ubuntu 22.04+ (recommended)
- Node.js 20+
- A `steam` user
- `steamcmd` installed at `/usr/games/steamcmd`

## Install
```bash
git clone https://github.com/sootypage/rust-panel-v2.git
cd rust-panel-v2
cp .env.example .env
npm install
node src/index.js
```

Open the panel:
- Local: `http://127.0.0.1:8080`
- Remote: `http://YOUR_SERVER_IP:8080`

## .env
Minimum:
```env
HOST=0.0.0.0
PORT=8080
JWT_SECRET=change_me_to_a_long_random_string
```

## Create first admin/owner
Start the panel once (creates `data/panel.db`), then:
```bash
cd rust-panel-v2
node - <<'NODE'
const bcrypt = require("bcrypt");
const { db } = require("./src/db");
const username = "admin";
const password = "CHANGE_ME";
const role = "owner"; // owner sees ALL servers
const hash = bcrypt.hashSync(password, 12);
db.prepare("INSERT OR IGNORE INTO users (username, password_hash, role) VALUES (?,?,?)")
  .run(username, hash, role);
console.log("Created:", username);
NODE
```

## Roles
- **owner**: can see/manage **all servers**
- **admin**: same privileges in this version
- **user**: can only see servers they created

## Sudo permissions (required)
Edit with:
```bash
sudo visudo
```

Add (change `minecraftgod2122` if your username is different):
```sudoers
# Rust Panel permissions
minecraftgod2122 ALL=(steam) NOPASSWD: /usr/games/steamcmd, /bin/chmod, /bin/mkdir, /bin/chown
minecraftgod2122 ALL=(root) NOPASSWD: /usr/bin/systemctl start rust-*.service, /usr/bin/systemctl stop rust-*.service, /usr/bin/systemctl restart rust-*.service, /usr/bin/systemctl daemon-reload, /usr/bin/systemctl enable rust-*.service, /usr/bin/systemctl disable rust-*.service
```

## Fix /srv/rust permissions (required)
```bash
sudo useradd -m -s /bin/bash steam 2>/dev/null || true
sudo mkdir -p /srv/rust
sudo chown -R steam:steam /srv/rust
sudo chmod -R 2775 /srv/rust
```

## Import an existing server
Use **Dashboard → Import Server** to add an existing Rust install that was created outside the panel.
It only needs:
- slug
- base dir (e.g. `/srv/rust/main`)
- ports + rcon settings

## Notes
- Default `server.level` used: **Procedural Map** (quoted correctly)
- If you leave RCON password empty, the panel generates one automatically.
- Install logs are written to: `data/install-logs/*.log`
