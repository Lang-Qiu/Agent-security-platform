#!/usr/bin/env bash
# Userspace Ollama install for WSL (no sudo). Downloads the official
# relocatable release archive and extracts it into ~/.local/ollama so
# `ollama serve` can run as the current user and bind 127.0.0.1:11434 — the
# endpoint the sandbox-security backend hardcodes. The backend runs inside
# this same WSL instance, so a WSL-local Ollama is reachable at that loopback
# address (a Windows-side Ollama would not be: WSL2 NAT does not map
# 127.0.0.1 to the Windows host).
#
# The release asset is now zstd-compressed (ollama-linux-amd64.tar.zst). The
# `zstd` CLI is not installed and apt needs a sudo password, so we decompress
# with Node's built-in zstd (node:zlib createZstdDecompress, available in the
# WSL Node v24) into a plain .tar, then extract with GNU tar.
set -euo pipefail

DEST="$HOME/.local/ollama"
ZST="/tmp/ollama-linux-amd64.tar.zst"
TAR="/tmp/ollama-linux-amd64.tar"
URL="https://github.com/ollama/ollama/releases/latest/download/ollama-linux-amd64.tar.zst"

# Load nvm so `node` is on PATH.
export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1090
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

mkdir -p "$DEST"

if [ ! -x "$DEST/bin/ollama" ]; then
  echo "[install-ollama] downloading $URL"
  curl -fL --retry 3 -o "$ZST" "$URL"
  echo "[install-ollama] decompressing zstd via node -> $TAR"
  node -e '
    const {createReadStream, createWriteStream} = require("node:fs");
    const {createZstdDecompress} = require("node:zlib");
    const src = process.argv[1], dst = process.argv[2];
    createReadStream(src)
      .pipe(createZstdDecompress())
      .pipe(createWriteStream(dst))
      .on("finish", () => process.exit(0))
      .on("error", (e) => { console.error(e); process.exit(1); });
  ' "$ZST" "$TAR"
  echo "[install-ollama] extracting to $DEST"
  tar -C "$DEST" -xf "$TAR"
  rm -f "$ZST" "$TAR"
else
  echo "[install-ollama] already present at $DEST/bin/ollama"
fi

"$DEST/bin/ollama" --version || true
echo "[install-ollama] done: $DEST/bin/ollama"
