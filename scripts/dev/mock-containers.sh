#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

CONTAINER_NAME="asp-negative-mock"
LEGACY_P0_CONTAINER_NAME="asp-p0-neg-mock"
LEGACY_AUTOGPT_CONTAINER_NAME="asp-autogpt-mock"

start_mock() {
  docker rm -f "${LEGACY_P0_CONTAINER_NAME}" >/dev/null 2>&1 || true
  docker rm -f "${LEGACY_AUTOGPT_CONTAINER_NAME}" >/dev/null 2>&1 || true
  docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
  docker run \
    --name "${CONTAINER_NAME}" \
    -d \
    -p 18001:8000 \
    -v "${ROOT_DIR}/scripts/dev/negative-sample-mock.py:/app/mock.py:ro" \
    python:3.12-alpine \
    python /app/mock.py >/dev/null
}

stop_all() {
  docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
  docker rm -f "${LEGACY_AUTOGPT_CONTAINER_NAME}" >/dev/null 2>&1 || true
  docker rm -f "${LEGACY_P0_CONTAINER_NAME}" >/dev/null 2>&1 || true
}

show_status() {
  docker ps --format '{{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -E "^${CONTAINER_NAME}\b" || true
}

command="${1:-}"

case "${command}" in
  start)
    start_mock
    show_status
    ;;
  stop)
    stop_all
    ;;
  restart)
    stop_all
    start_mock
    show_status
    ;;
  status)
    show_status
    ;;
  *)
    echo "Usage: bash scripts/dev/mock-containers.sh <start|stop|restart|status>"
    exit 1
    ;;
esac