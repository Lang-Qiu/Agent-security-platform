# Track 1 OpenClaw Security Demo Runtime

This directory contains the Docker Compose topology and runtime configuration for the Track 1 OpenClaw security evaluation campaign.

## Architecture

The runtime uses isolated Docker Compose networks to segment components:

- **track1-public**: Frontend and backend public interface (port 3000)
- **track1-ingest**: Backend internal ingest API (port 3001), OpenClaw gateway, and campaign runner
- **track1-model-egress**: OpenClaw gateway to external model provider

## Services

### Frontend
- Public-facing web interface
- Published port: 3000
- Network: track1-public only

### Backend
- Handles public API requests and internal campaign ingest
- Public port 3000 (published), internal port 3001 (exposed only)
- Networks: track1-public, track1-ingest

### OpenClaw Gateway
- Isolated agent runtime with restricted tool access
- No published ports (internal only)
- Ephemeral tmpfs storage for workspace and sessions
- Networks: track1-ingest, track1-model-egress

### Campaign Runner
- Orchestrates the security evaluation campaign
- One-shot execution (restart: no)
- Depends on healthy backend and OpenClaw gateway
- Network: track1-ingest only

## Security Controls

1. **Network Isolation**: Frontend cannot reach internal ingest; OpenClaw cannot reach frontend
2. **Ephemeral Storage**: All OpenClaw workspace, session, and message data stored in tmpfs
3. **Read-only Mounts**: Cases and configuration are mounted read-only
4. **No Secret Persistence**: All credentials enter through runtime environment variables
5. **Health Dependencies**: Runner waits for healthy backend and OpenClaw before starting

## Prerequisites

Required environment variables:

```bash
# Model provider configuration
export OPENCLAW_MODEL_BASE_URL="https://api.anthropic.com/v1"
export OPENCLAW_MODEL_API_KEY="your-api-key"
export OPENCLAW_MODEL_ID="anthropic/claude-sonnet-5"

# Backend ingest authentication
export TRACK1_INGEST_TOKEN="$(openssl rand -hex 32)"
```

## Usage

Build all images:

```bash
docker compose -f deploy/track1/compose.track1.yml --profile track1 build
```

Validate rendered configuration (with test-only values):

```bash
export OPENCLAW_MODEL_BASE_URL='https://model.example.test/v1'
export OPENCLAW_MODEL_API_KEY='test-only-key'
export OPENCLAW_MODEL_ID='provider/model-safe'
export TRACK1_INGEST_TOKEN='0123456789abcdef0123456789abcdef'
docker compose -f deploy/track1/compose.track1.yml --profile track1 config
```

Run the campaign:

```bash
docker compose -f deploy/track1/compose.track1.yml --profile track1 up
```

View logs:

```bash
docker compose -f deploy/track1/compose.track1.yml --profile track1 logs -f campaign-runner
```

Clean up:

```bash
docker compose -f deploy/track1/compose.track1.yml --profile track1 down -v
```

## Limitations

- Docker Compose alone cannot enforce hostname-level model egress restrictions
- External model endpoint restriction requires:
  1. Validated model URL in environment (enforced by preflight)
  2. Deployment-level firewall policy for network egress
- Do not claim stronger egress guarantees than the deployment provides
