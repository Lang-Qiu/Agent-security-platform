#!/usr/bin/env python3
import json
from http.server import BaseHTTPRequestHandler, HTTPServer


class Handler(BaseHTTPRequestHandler):
    server_version = "autogpt-mock/1.0"

    def _send(self, status: int, payload: dict, extra_headers: dict | None = None) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Server", "autogpt-mock/1.0")
        if extra_headers:
            for key, value in extra_headers.items():
                self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path == "/api/agent/status":
            # Intentionally close to target signal but missing required agent_id.
            self._send(
                200,
                {"status": "running", "current_task": "demo", "uptime_seconds": 4523},
                {
                    "X-Forwarded-Host": "autogpt.internal",
                    "Via": "1.1 edge-proxy"
                }
            )
            return

        if self.path == "/api/status":
            self._send(200, {"agent_id": "agent-789", "status": "active", "mode": "production"})
            return

        if self.path == "/api/agents/status":
            self._send(
                200,
                {"agents": [{"id": "agent-123", "status": "idle"}]},
                {
                    "X-Forwarded-Host": "autogpt.internal",
                    "Via": "1.1 edge-proxy"
                }
            )
            return

        if self.path == "/health":
            self._send(200, {"status": "healthy", "version": "1.2.0"})
            return

        self._send(404, {"error": "not found"})


def main() -> None:
    server = HTTPServer(("0.0.0.0", 8000), Handler)
    server.serve_forever()


if __name__ == "__main__":
    main()