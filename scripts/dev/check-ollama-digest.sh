#!/usr/bin/env bash
# Read the qwen3:8b digest that /api/tags reports (the exact field the
# sandbox-security backend compares against) and diff it against the pinned
# SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST in the env file. Prints the raw tags
# JSON payload for the model too, so we see precisely what the backend sees.
set -euo pipefail

ENV_FILE="/mnt/e/LQiu/Agent-security-platform/.env.sandbox-security.local"

echo "=== raw /api/tags ==="
curl -s http://127.0.0.1:11434/api/tags > /tmp/ollama-tags.json
cat /tmp/ollama-tags.json
echo
echo "=== extracted digest (qwen3:8b) ==="
# The models[] entry for qwen3:8b carries a "digest":"<64hex>" field.
wire=$(grep -oE '"digest":"[a-f0-9]{64}"' /tmp/ollama-tags.json | head -1 | grep -oE '[a-f0-9]{64}')
echo "wire_digest=$wire"
echo "normalized=sha256:$wire"

echo "=== pinned env digest ==="
pinned=$(grep '^SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST=' "$ENV_FILE" | cut -d= -f2-)
echo "pinned=$pinned"

if [ "sha256:$wire" = "$pinned" ]; then
  echo "RESULT=MATCH_EXACT"
else
  echo "RESULT=MISMATCH"
fi
