# 🦀 Rust Panel v2

A lightweight self-hosted web panel to manage **Rust dedicated servers** on Linux with:
- UI login + roles
- Create servers from the UI (no JSON editing)
- systemd services per server (start/stop/restart + auto-restart)
- CPU/RAM stats, player count, IP/port display
- File Manager (browse/edit/upload)
- Backups + download
- Discord webhook stats
- Optional VPS IP / Playit endpoint display

> **Note:** This panel needs **steamcmd** available on the machine that installs Rust servers.

---

## ✅ Requirements (Ubuntu/Debian)

Install once:

```bash
sudo apt update
sudo apt install -y git curl build-essential python3 make g++ jq
```

### Install Node.js 20 (recommended)
If your distro Node is old:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### Install steamcmd
On Ubuntu:

```bash
sudo dpkg --add-architecture i386
sudo add-apt-repository -y multiverse
sudo apt update
sudo apt install -y steamcmd
```

If `steamcmd` installs but isn't in PATH, run:

```bash
sudo ln -s /usr/games/steamcmd /usr/local/bin/steamcmd
```

Create the `steam` user + rust folder:

```bash
sudo useradd -m -s /bin/bash steam || true
sudo mkdir -p /srv/rust
sudo chown -R steam:steam /srv/rust
```

---

## 🚀 Install the panel

```bash
git clone https://github.com/sootypage/rust-panel-v2.git
cd rust-panel-v2
cp .env.example .env
npm install
npm start
```

Open:

- `http://SERVER_IP:3000`

The panel binds to **0.0.0.0** by default.

---

## 👤 First admin user

Run from the project folder:

```bash
node - <<'NODE'
const bcrypt = require("bcrypt");
const { db } = require("./src/db");
const username = "admin";
const password = "change-me";
const role = "admin";
const hash = bcrypt.hashSync(password, 12);
db.prepare("INSERT OR IGNORE INTO users (username, password_hash, role) VALUES (?,?,?)")
  .run(username, hash, role);
console.log("Created admin:", username, "password:", password);
NODE
```

---

## 🧱 Create Server (UI)

Go to **Create Server** and fill:
- slug + name
- RAM limit (MiB) (optional)
- Max players
- Map size + seed
- Game port + query port + RCON port
- Optional: **Use VPS forwarding** (shows VPS IP as connect IP)
- Optional: Playit endpoint/token

When you click **Create**, the panel will:
- install Rust to `/srv/rust/<slug>` using steamcmd
- create `/etc/systemd/system/rust-<slug>.service`
- enable the service
- start the server

---

## ♾ 24/7 servers (auto-restart)

Each server runs as a **systemd service** with `Restart=always`.
That means:
- If the Rust process crashes, systemd restarts it
- On reboot, enabled services start again
- Servers stay **24/7** as long as you don’t stop them

Manual control examples:

```bash
sudo systemctl status rust-main
sudo systemctl restart rust-main
sudo systemctl stop rust-main
sudo systemctl start rust-main
```

---

## 🛠 Troubleshooting

### Create Server install looks “stuck”
Check install logs:

```bash
ls -lah data/install-logs
tail -n 50 data/install-logs/*.log
```

### Permission errors
Make sure rust folder is owned by steam:

```bash
sudo chown -R steam:steam /srv/rust
```

### Can’t access panel from browser
Open firewall port:

```bash
sudo ufw allow 3000/tcp
```

---


### Panel permissions test (required for auto-install)

```bash
sudo -n -u steam /usr/games/steamcmd +quit
```

Install logs:

```bash
ls -lah data/install-logs
```
