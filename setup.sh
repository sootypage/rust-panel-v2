#!/usr/bin/env bash
set -euo pipefail

echo "[setup] Rust Panel quick setup (Ubuntu 22.04/24.04)"
echo "[setup] This installs: Node.js 20, build tools, steamcmd, and creates a 'steam' user."

if [[ $EUID -ne 0 ]]; then
  echo "Please run as root (sudo): sudo ./setup.sh"
  exit 1
fi

apt update
apt install -y curl ca-certificates gnupg lsb-release software-properties-common       build-essential python3 make g++ unzip git jq

# Node.js 20 (NodeSource)
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/v//;s/\..*//')" -lt 18 ]]; then
  echo "[setup] Installing Node.js 20..."
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
  apt update
  apt install -y nodejs
fi

# SteamCMD (needs multiverse + i386)
echo "[setup] Installing steamcmd..."
dpkg --add-architecture i386 || true
add-apt-repository -y multiverse || true
apt update

# Some images don't have steamcmd candidate; try apt, else fallback to manual install
if apt-cache policy steamcmd | grep -q "Candidate:" && ! apt-cache policy steamcmd | grep -q "Candidate: (none)"; then
  apt install -y steamcmd
  STEAMCMD_BIN="$(command -v steamcmd || true)"
  if [[ -z "$STEAMCMD_BIN" && -x /usr/games/steamcmd ]]; then STEAMCMD_BIN="/usr/games/steamcmd"; fi
  echo "[setup] steamcmd installed at: ${STEAMCMD_BIN:-/usr/games/steamcmd}"
else
  echo "[setup] steamcmd has no candidate in apt on this image. Installing manual steamcmd..."
  apt install -y lib32gcc-s1 || true
  mkdir -p /opt/steamcmd
  cd /opt/steamcmd
  curl -fsSLO https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz
  tar -xzf steamcmd_linux.tar.gz
  ln -sf /opt/steamcmd/steamcmd.sh /usr/local/bin/steamcmd
  echo "[setup] steamcmd installed at: /usr/local/bin/steamcmd"
fi

# Create steam user (for running servers)
if ! id -u steam >/dev/null 2>&1; then
  useradd -m -s /bin/bash steam
  echo "[setup] Created user: steam"
else
  echo "[setup] User steam already exists"
fi

# Create base rust dir
mkdir -p /srv/rust
chown -R steam:steam /srv/rust

echo ""
echo "[setup] Done."
echo "[setup] Next:"
echo "  1) As your normal user: cp .env.example .env"
echo "  2) npm install"
echo "  3) node src/index.js"
echo ""
echo "[setup] Panel will bind on 0.0.0.0 by default. Open: http://<SERVER_IP>:3000"
