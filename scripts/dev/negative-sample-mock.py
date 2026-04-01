#!/usr/bin/env python3
import json
from http.server import BaseHTTPRequestHandler, HTTPServer


class Handler(BaseHTTPRequestHandler):
    server_version = "negative-sample-mock/1.0"

    def _send(self, status: int, payload: dict, extra_headers: dict | None = None) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Server", "negative-sample-mock/1.0")
        if extra_headers:
            for key, value in extra_headers.items():
                self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        cross_mode = "cross=1" in self.path
        spoof_mode = "spoof=1" in self.path

        if self.path == "/openclaw/health":
            self._send(
                200,
                {"status": "ok", "gateway_note": "hello-ok via edge"},
                {"X-Forwarded-Server": "gateway-edge", "Via": "1.1 envoy"}
            )
            return

        if self.path.startswith("/openclaw/health") and cross_mode:
            self._send(
                200,
                {
                    "status": "ok",
                    "models": [{"name": "llama3"}],
                    "agent_id": "agent-shadow"
                },
                {"X-Upstream-Service": "ollama", "Via": "1.1 cross-gateway"}
            )
            return

        if self.path.startswith("/openclaw/health") and spoof_mode:
            self._send(
                200,
                {
                    "status": "ok",
                    "type": "hello_ko",
                    "presence_state": "available"
                },
                {"X-Format-Spoof": "openclaw-like", "Via": "1.1 schema-mask"}
            )
            return

        if self.path == "/api/tags":
            self._send(
                200,
                {"items": [{"name": "demo"}], "middleware": "oauth2-proxy"},
                {"X-Upstream-Service": "ollama", "Via": "1.1 nginx"}
            )
            return

        if self.path.startswith("/api/tags") and cross_mode:
            self._send(
                200,
                {
                    "items": [{"name": "demo"}],
                    "flow_id": "lf-123",
                    "agent_id": "agent-shadow"
                },
                {"X-Proxy-Target": "langflow", "Via": "1.1 cross-gateway"}
            )
            return

        if self.path.startswith("/api/tags") and spoof_mode:
            self._send(
                200,
                {
                    "model_list": [{"name": "demo"}],
                    "models_count": 1,
                    "status": "ok"
                },
                {"X-Format-Spoof": "ollama-like", "Via": "1.1 schema-mask"}
            )
            return

        if self.path == "/api/v1/flows":
            self._send(
                200,
                {"flows": [{"id": 1, "name": "pipeline"}], "injected_by": "api-gateway"},
                {"X-Proxy-Target": "langflow", "Via": "1.1 istio"}
            )
            return

        if self.path.startswith("/api/v1/flows") and cross_mode:
            self._send(
                200,
                {
                    "items": [{"name": "model-A"}],
                    "agent_id": "agent-shadow"
                },
                {"X-Upstream-Service": "ollama", "Via": "1.1 cross-gateway"}
            )
            return

        if self.path.startswith("/api/v1/flows") and spoof_mode:
            self._send(
                200,
                {
                    "flows_meta": [{"id": "f1", "name": "pipeline"}],
                    "flowId": "f1",
                    "status": "ok"
                },
                {"X-Format-Spoof": "langflow-like", "Via": "1.1 schema-mask"}
            )
            return

        if self.path == "/api/agent/status":
            self._send(
                200,
                {"status": "running", "current_task": "demo", "uptime_seconds": 4523},
                {"X-Forwarded-Host": "autogpt.internal", "Via": "1.1 edge-proxy"}
            )
            return

        if self.path.startswith("/api/agent/status") and cross_mode:
            self._send(
                200,
                {
                    "status": "running",
                    "models": [{"name": "mixtral"}],
                    "flow_id": "lf-cross"
                },
                {"X-Upstream-Service": "ollama", "Via": "1.1 cross-gateway"}
            )
            return

        if self.path.startswith("/api/agent/status") and spoof_mode:
            self._send(
                200,
                {
                    "status": "running",
                    "agentId": "agent-123",
                    "agent-id": "agent-123"
                },
                {"X-Format-Spoof": "autogpt-like", "Via": "1.1 schema-mask"}
            )
            return

        if self.path == "/api/status":
            self._send(200, {"agent_id": "agent-789", "status": "active", "mode": "production"})
            return

        if self.path == "/api/agents/status":
            self._send(
                200,
                {"agents": [{"id": "agent-123", "status": "idle"}]},
                {"X-Forwarded-Host": "autogpt.internal", "Via": "1.1 edge-proxy"}
            )
            return

        if self.path == "/health":
            self._send(200, {"status": "healthy", "version": "1.2.0"})
            return

        self._send(404, {"error": "not found"}, {"Via": "1.1 edge-proxy"})


def main() -> None:
    server = HTTPServer(("0.0.0.0", 8000), Handler)
    server.serve_forever()


if __name__ == "__main__":
    main()