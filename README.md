# Rust Panel v2 (starter)

A self-hosted Rust server panel with:
- Users/login/roles (JWT)
- Create servers from UI (SQLite)
- systemd-managed servers (per-server service)
- Live log streaming (Socket.IO)
- Metrics (CPU/RAM) via systemd MainPID
- File manager (sandboxed path)
- Backups (tar.gz + download)
- Plugin manager (uMod/Oxide .cs upload + enable/disable)

## Requirements
- Ubuntu (recommended)
- Node.js **20+**
- systemd (not ideal on WSL unless you enable it)

## Install
```bash
git clone <your repo url>
cd rust-panel-v2
cp .env.example .env
npm install
```

## Create Linux user for servers
```bash
sudo useradd -m -s /bin/bash steam || true
sudo mkdir -p /srv/rust
sudo chown -R steam:steam /srv/rust
```

## Create first admin user
```bash
node - <<'NODE'
const bcrypt = require("bcrypt");
const { db } = require("./src/db");
const username = "admin";
const password = "ChangeThisPasswordNow!";
const role = "admin";
const hash = bcrypt.hashSync(password, 12);
db.prepare("INSERT OR IGNORE INTO users (username, password_hash, role) VALUES (?,?,?)")
  .run(username, hash, role);
console.log("Created admin:", username, "password:", password);
NODE
```

## Run
```bash
npm start
```

Open:
- http://127.0.0.1:3000/login.html

## HTTPS + Domain (recommended)
Run the panel bound to 127.0.0.1 and put Nginx in front with Let's Encrypt certs.

Example Nginx config is in `docs/nginx-example.conf`.

## Notes
- `baseDir` is restricted to `/srv/rust/<slug>` for safety.
- For production, rotate logs and set strong `JWT_SECRET` in `.env`.
