# sootypage game panel (Rust-first)

A lightweight web panel (AMP/Crafty-inspired) for managing **Rust dedicated servers** on Ubuntu.

- Web UI: login, dashboard, create server, server controls
- Installs RustDedicated via **steamcmd** (app id 258550)
- Optional **uMod/Oxide** install when creating a server ("Modded")
- Uses **systemd** so servers can run 24/7 and restart on boot

## Requirements

- Ubuntu 20.04/22.04/24.04
- Node.js **18+** (Node 20 recommended)
- sudo access (NOPASSWD recommended for steamcmd + systemctl)

## Install

```bash
git clone https://github.com/sootypage/sootypage-game-panel.git
cd sootypage-game-panel

# create your env
cp .env.example .env
nano .env

npm install
node src/index.js
```

Open:

- `http://YOUR_SERVER_IP:2323/` (or whatever `PORT` is set to)

The app binds to **0.0.0.0** by default.

## Owner account

On first start, the panel creates an **owner** user from `.env`:

- `OWNER_USER`
- `OWNER_PASS`

After that, you can add more users from the Users page (owner/admin only).

## Create server

Create Server installs Rust to:

- `${RUST_ROOT}/${slug}` (default `RUST_ROOT=/srv/rust`)

It sets:

- server (game) port
- query port
- rcon host/port/password
- map size + seed
- max players
- optional uMod/Oxide install

## systemd / 24/7

Each server gets a unit:

- `rust-<slug>.service`

Servers can be started/stopped/restarted from the panel, and can be enabled to start on boot.

## Troubleshooting

### Buttons do nothing

This panel uses a strict Content-Security-Policy (no inline scripts). Make sure you did not remove the `*.js` files in `public/`.

### Login works via curl but not in browser

All API routes are mounted under `/api`, so login is:

- `POST /api/auth/login`

### steamcmd / permissions

If installs fail, verify steamcmd exists:

```bash
command -v steamcmd || ls -lah /usr/games/steamcmd
```

If you want installs to work without typing a sudo password, add NOPASSWD rules for your user (use `visudo`).

Example (replace `minecraftgod2122` with your Linux username):

```text
# allow steamcmd + steam user setup + systemd units without password
minecraftgod2122 ALL=(root) NOPASSWD: /usr/bin/apt-get, /usr/bin/dpkg, /usr/bin/systemctl, /usr/bin/bash, /bin/mkdir, /bin/chown
minecraftgod2122 ALL=(steam) NOPASSWD: /usr/games/steamcmd, /bin/chmod
```

Also ensure your Rust root exists and is writable by the installer:

```bash
sudo mkdir -p /srv/rust
sudo chown -R steam:steam /srv/rust
```

---

Made for **sootypage game panel**.


## First-time setup (required)

Run these once so the panel can install servers and manage systemd without asking for a sudo password:

```bash
sudo ./scripts/setup-deps.sh
sudo ./scripts/setup-sudoers.sh
```

Then start the panel:

```bash
cp .env.example .env
npm install
npm start
```

Open: `http://YOUR_IP:8080` (or set `PORT` in `.env`).
