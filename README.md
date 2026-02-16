# sootypage game panel

A clean restart that works: login, dashboard, create/install Rust servers, systemd management, metrics, RCON, live logs.

## Install + Run
```bash
cp .env.example .env
npm install
node src/index.js
```

Open:
- `http://SERVER_IP:8080/login.html`

## First user (OWNER)
On first start, the panel will auto-create an **owner** user if the database is empty.

Set these in `.env` before starting:
- `OWNER_USERNAME`
- `OWNER_PASSWORD`

Then start the panel. You can create more users from the **Users** page.

## Required system setup

### Create `steam` user + rust root
```bash
sudo useradd -m -s /bin/bash steam 2>/dev/null || true
sudo mkdir -p /srv/rust
sudo chown -R steam:steam /srv/rust
sudo chmod -R 2775 /srv/rust
```

### Passwordless sudo (REQUIRED)
The panel uses `sudo -n` for systemd + apt + journalctl.

Edit sudoers:
```bash
sudo visudo
```

Add (replace `YOURUSER`):
```sudoers
YOURUSER ALL=(root) NOPASSWD: /usr/bin/systemctl *, /usr/bin/apt-get *, /usr/bin/journalctl *
YOURUSER ALL=(steam) NOPASSWD: /usr/games/steamcmd, /bin/chmod
```

## What you get now
- ✅ Owner role (sees all servers)
- ✅ Dashboard (cards) + per-server page
- ✅ Create server (installs Rust via steamcmd)
- ✅ systemd service per server (24/7 while enabled)
- ✅ CPU/RAM graph per server
- ✅ Live logs (journalctl streaming)
- ✅ RCON console
