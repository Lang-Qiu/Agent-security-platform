# Track 1 OpenClaw Demo Runtime

This Compose profile starts the pinned OpenClaw `2026.6.10` runtime, the
backend (public + internal-ingest listener), the frontend supervision
console, and the one-shot campaign runner.

## Prerequisites

- Docker Engine and Docker Compose v2.
- A configured OpenAI-compatible cloud model endpoint (required only for a
  real credentialed campaign run — Phase 7).

## Required environment variables

```text
OPENCLAW_MODEL_BASE_URL   HTTPS endpoint, no credentials/query/fragment
OPENCLAW_MODEL_API_KEY    cloud model API key
OPENCLAW_MODEL_ID         closed provider/model-id grammar
TRACK1_INGEST_TOKEN       at least 32 random bytes
```

Do not commit real values. Use `.env` (git-ignored) or your shell environment.

## Commands

```powershell
docker compose -f deploy/track1/compose.track1.yml --profile track1 build
docker compose -f deploy/track1/compose.track1.yml --profile track1 up -d openclaw-gateway backend frontend
docker compose -f deploy/track1/compose.track1.yml --profile track1 run --rm openclaw-gateway openclaw plugins inspect agent-security-track1 --runtime --json
npm run demo:track1:openclaw
```

## Topology

| Service | Published to host | Notes |
| --- | --- | --- |
| `backend` | `3000` (public API only) | internal ingest listener `3001` is `expose`-only |
| `openclaw-gateway` | none | tmpfs workspace/session/message state |
| `campaign-runner` | none | one-shot; depends on healthy backend + gateway |
| `frontend` | dev server on the `track1-public` network only | |

The internal ingest port is never published to the host and is unreachable
from the `track1-public` network. Compose alone cannot enforce hostname-level
egress restriction for the model endpoint; deployment firewall policy is
required in addition to the validated HTTPS URL.
