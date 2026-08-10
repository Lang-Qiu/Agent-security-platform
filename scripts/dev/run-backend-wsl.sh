#!/usr/bin/env bash
# Local dev launcher for the backend under WSL (Ubuntu).
#
# Why this exists: the sandbox-security SQLite module hard-requires the DB
# parent directory to satisfy `mode & 0o077 == 0` (owner-only). Native
# Windows and /mnt DrvFs mounts always report 0777/0666, so the DB must live
# on the ext4 filesystem (e.g. /home/<user>/sandbox-security) where chmod 700
# actually sticks. Code is read from /mnt/e; only storage moves to ext4.
set -euo pipefail

REPO_DIR="/mnt/e/LQiu/Agent-security-platform"
STORAGE_DIR="${SANDBOX_SECURITY_STORAGE_DIR:-$HOME/sandbox-security}"

# Load nvm so `node` is on PATH regardless of login/interactive shell mode.
export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1090
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# Ext4 storage dir, owner-only.
mkdir -p "$STORAGE_DIR"
chmod 700 "$STORAGE_DIR"

cd "$REPO_DIR"

# Inline exports win over --env-file (Node ignores env-file values that are
# already defined in the environment), so this overrides the Windows-style
# storage path baked into the .env file.
export SANDBOX_SECURITY_STORAGE_PATH="$STORAGE_DIR/db.sqlite"
export PORT="${PORT:-3000}"
export PUBLIC_BIND_HOST="${PUBLIC_BIND_HOST:-0.0.0.0}"

echo "[run-backend-wsl] node: $(command -v node) $(node -v)"
echo "[run-backend-wsl] storage: $SANDBOX_SECURITY_STORAGE_PATH"
echo "[run-backend-wsl] port: $PORT bind: $PUBLIC_BIND_HOST"

exec node --experimental-strip-types \
  --env-file=.env.sandbox-security.local \
  backend/src/main.ts
