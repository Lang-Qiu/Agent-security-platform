# Protected OpenClaw runtime

This deployment runs the standalone GENERAL-004 package containing exactly
OpenClaw `2026.6.34`, the sealed general-security patch, and the
`agent-security-sandbox-general` plugin. It is separate from Track 1 and does
not reuse the Track 1 package, plugin, configuration, image, or network.

## Prerequisites

- Docker Engine, Docker Compose v2, and BuildKit/buildx.
- A running GENERAL-003 backend on the operator-managed internal network.
- A dedicated enforcement capability issued by GENERAL-003. The only accepted
  scope is `sandbox_security:enforcement:audit:write`.

Create an operator-provided internal network and attach the backend container
with the fixed hostname alias before starting OpenClaw:

```bash
docker network create --internal sandbox-security-internal-audit
docker network connect --alias sandbox-security-backend sandbox-security-internal-audit <backend-container>
```

Issue the dedicated capability through the GENERAL-003 administrator route
`POST /internal/sandbox/security/capabilities` using the private
`sandbox-security-enforcement-audit-capability-issue-request.v1` schema. The
backend owns the scope, stages, production composition, and endpoint. Use a
TTL no longer than 3600 seconds (one hour); automatic rotation is not part of
this deployment. The bootstrap administrator credential is used only against
GENERAL-003 and is never placed in this configuration.

## Configuration

The four plugin values are injected only at process startup. Use an
operator-issued `sbxcap_v1` token and never put its value in a Dockerfile,
image label, checked-in file, shell history, or diagnostic output:

```bash
export SANDBOX_SECURITY_POLICY_PROFILE_ID=sandbox-security-balanced.v1
export SANDBOX_SECURITY_PRODUCTION_MODE=rule_only
export SANDBOX_SECURITY_AUDIT_ENDPOINT=http://sandbox-security-backend:3001/internal/sandbox/security/enforcement-events
read -r -s -p 'Sandbox security capability token: ' SANDBOX_SECURITY_AUDIT_CAPABILITY_TOKEN
printf '\n'
export SANDBOX_SECURITY_AUDIT_CAPABILITY_TOKEN
```

The service publishes no host port, uses no named or anonymous volume, and
uses tmpfs for `/run/openclaw-security`, `/tmp/openclaw`, and `/workspace`.
The root filesystem is read-only, the process is non-root, all Linux
capabilities are dropped, and `no-new-privileges` is enabled.

## Validate and start

Use dummy-only values when inspecting rendered Compose output. Do not render or
retain a real capability token in diagnostics:

```bash
docker compose -f deploy/sandbox-security/compose.openclaw-security.yml \
  --profile sandbox-security config
docker compose -f deploy/sandbox-security/compose.openclaw-security.yml \
  --profile sandbox-security build openclaw-security
docker compose -f deploy/sandbox-security/compose.openclaw-security.yml \
  --profile sandbox-security up -d openclaw-security
docker compose -f deploy/sandbox-security/compose.openclaw-security.yml \
  --profile sandbox-security ps
```

The image startup and healthcheck rerun package identity, patch digest,
patched-file hashes, and the exact four-barrier P4 runtime probe before the
gateway is allowed to start. The probe command is:

```text
openclaw plugins inspect agent-security-sandbox-general --runtime --json
```

Run the probe explicitly without invoking a model or ordinary agent command:

```bash
docker compose -f deploy/sandbox-security/compose.openclaw-security.yml \
  --profile sandbox-security run --rm --no-deps --entrypoint openclaw \
  openclaw-security plugins inspect agent-security-sandbox-general \
  --runtime --json
```

The expected state is one loaded plugin, four barriers, enforcement healthy,
and no diagnostics. A backend outage may report `audit-degraded` while
enforcement remains healthy; it never permits a failed enforcement probe or
ordinary action to continue.

## Stop and inspect

Stop with SIGTERM and remove the ephemeral service state:

```bash
docker compose -f deploy/sandbox-security/compose.openclaw-security.yml \
  --profile sandbox-security stop
docker compose -f deploy/sandbox-security/compose.openclaw-security.yml \
  --profile sandbox-security down --remove-orphans
docker volume ls
```

The final command must not show a volume created by this deployment. Compose
 does not define an egress firewall or provider network policy; egress
 confinement is operator guidance and is out of scope for GENERAL-004
 acceptance.
