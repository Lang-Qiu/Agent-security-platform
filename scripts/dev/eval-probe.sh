#!/usr/bin/env bash
# Send a sandbox-security evaluation and print the detector_runs summary so we
# can confirm which detectors executed vs skipped. Token is passed as $1, the
# JSON body file as $2.
set -euo pipefail

TOKEN="$1"
BODY_FILE="$2"

# Load nvm so `node` is on PATH regardless of shell mode.
export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1090
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

resp="$(curl -s -X POST http://127.0.0.1:3000/api/sandbox/security/evaluations \
  -H "authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -H "idempotency-key: probe-$(date +%s%N)" \
  --data-binary @"$BODY_FILE")"

echo "=== raw response ==="
echo "$resp"
echo
echo "=== verdict / action / risk ==="
echo "$resp" | grep -Eo '"verdict":"[^"]*"|"action":"[^"]*"|"risk_level":"[^"]*"' || true
echo
echo "=== detector_runs (kind / status / skip_reason) ==="
node -e '
  let s="";
  process.stdin.on("data",d=>s+=d).on("end",()=>{
    try {
      const j=JSON.parse(s);
      const runs=(j.data&&j.data.detector_runs)||[];
      for (const r of runs) {
        console.log(`${r.detector_kind}\t${r.status}\t${r.skip_reason??""}\t${r.error_code??""}`);
      }
    } catch(e){ console.error("parse-failed:",e.message); }
  });
' <<<"$resp"
