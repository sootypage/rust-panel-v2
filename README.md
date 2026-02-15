# 🦀 Rust Panel v2

A lightweight self-hosted web panel to manage **Rust dedicated servers** on Linux with:
- UI login + roles
- Create servers from the UI (no JSON editing)
- systemd services per server (start/stop/restart + auto-restart)
- CPU/RAM stats, player count, IP/port display
- File Manager (browse/edit/upload)
- Backups + download
- Discord webhook stats

> **Note:** This panel needs **steamcmd** available on the machine that installs Rust servers.

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
