#!/usr/bin/env bash
# Mint a sandbox-security capability token for the general-001~005 frontend demo.
#
# Calls the INTERNAL issue endpoint (bound on :3001) with the admin bootstrap
# token as Bearer. The returned bearer_token is what you paste into the
# frontend workbench "能力令牌" field.
set -euo pipefail

REPO_DIR="/mnt/e/LQiu/Agent-security-platform"
ENV_FILE="$REPO_DIR/.env.sandbox-security.local"
BODY_FILE="$REPO_DIR/.runtime/capability-issue.json"
INTERNAL_URL="http://127.0.0.1:3001/internal/sandbox/security/capabilities"

# Extract the admin bootstrap token, tolerating CRLF in the env file.
ADMIN="$(grep -E '^SANDBOX_SECURITY_ADMIN_BOOTSTRAP_TOKEN=' "$ENV_FILE" \
  | head -n1 | cut -d= -f2- | tr -d '\r\n')"

if [ -z "$ADMIN" ]; then
  echo "[mint] ERROR: admin bootstrap token not found in $ENV_FILE" >&2
  exit 1
fi
if [ ! -f "$BODY_FILE" ]; then
  echo "[mint] ERROR: body file missing: $BODY_FILE" >&2
  exit 1
fi

echo "[mint] admin token length: ${#ADMIN}"
echo "[mint] request body:"
cat "$BODY_FILE"
echo
echo "[mint] response:"
curl -sS -w '\n[mint] HTTP %{http_code}\n' \
  -X POST "$INTERNAL_URL" \
  -H "authorization: Bearer $ADMIN" \
  -H "content-type: application/json" \
  --data-binary "@$BODY_FILE"
