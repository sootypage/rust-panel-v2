#!/usr/bin/env bash
set -euo pipefail

USER_NAME="${SUDO_USER:-$(whoami)}"
SUDOERS_FILE="/etc/sudoers.d/sootypage-game-panel"

echo "[setup] Installing sudoers rules for user: ${USER_NAME}"
cat > "${SUDOERS_FILE}" <<EOF
# Sootypage Game Panel - allow the panel user to manage its own systemd units without a password.
# Edit with: sudo visudo -f ${SUDOERS_FILE}

${USER_NAME} ALL=(root) NOPASSWD: /usr/bin/systemctl daemon-reload
${USER_NAME} ALL=(root) NOPASSWD: /usr/bin/systemctl enable sootypage-*.service
${USER_NAME} ALL=(root) NOPASSWD: /usr/bin/systemctl disable sootypage-*.service
${USER_NAME} ALL=(root) NOPASSWD: /usr/bin/systemctl start sootypage-*.service
${USER_NAME} ALL=(root) NOPASSWD: /usr/bin/systemctl stop sootypage-*.service
${USER_NAME} ALL=(root) NOPASSWD: /usr/bin/systemctl restart sootypage-*.service
${USER_NAME} ALL=(root) NOPASSWD: /usr/bin/systemctl status sootypage-*.service
${USER_NAME} ALL=(root) NOPASSWD: /usr/bin/journalctl -u sootypage-*.service *

# Allow creating/writing units/scripts under these paths
${USER_NAME} ALL=(root) NOPASSWD: /usr/bin/bash -lc *
${USER_NAME} ALL=(root) NOPASSWD: /bin/mkdir *
${USER_NAME} ALL=(root) NOPASSWD: /bin/chown *
${USER_NAME} ALL=(root) NOPASSWD: /bin/chmod *
EOF

chmod 440 "${SUDOERS_FILE}"
visudo -cf "${SUDOERS_FILE}" >/dev/null

echo "[setup] OK: sudoers installed at ${SUDOERS_FILE}"
echo "[setup] Tip: You can test with: sudo -n systemctl daemon-reload && echo OK"
