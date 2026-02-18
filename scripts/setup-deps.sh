#!/usr/bin/env bash
set -euo pipefail

echo "[setup] Installing OS dependencies (steamcmd, unzip, curl, Java for Minecraft)..."
sudo apt-get update -y
sudo apt-get install -y steamcmd unzip curl ca-certificates default-jre-headless

echo "[setup] Creating game directories..."
sudo mkdir -p /srv/rust /srv/minecraft
sudo chown -R "$USER":"$USER" /srv/rust /srv/minecraft

echo "[setup] Done."
