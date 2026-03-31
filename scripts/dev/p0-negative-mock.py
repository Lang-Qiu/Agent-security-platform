#!/usr/bin/env python3
import json
from http.server import BaseHTTPRequestHandler, HTTPServer


class Handler(BaseHTTPRequestHandler):
    server_version = "p0-negative-mock/2.0"

    def _send(self, status: int, payload: dict, extra_headers: dict | None = None) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Server", "p0-negative-mock/2.0")
        if extra_headers:
            for key, value in extra_headers.items():
                self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path == "/openclaw/health":
            self._send(
                200,
                {"status": "ok", "gateway_note": "hello-ok via edge"},
                {
                    "X-Forwarded-Server": "gateway-edge",
                    "Via": "1.1 envoy"
                }
            )
            return

        if self.path == "/api/tags":
            self._send(
                200,
                {"items": [{"name": "demo"}], "middleware": "oauth2-proxy"},
                {
                    "X-Upstream-Service": "ollama",
                    "Via": "1.1 nginx"
                }
            )
            return

        if self.path == "/api/v1/flows":
            self._send(
                200,
                {"flows": [{"id": 1, "name": "pipeline"}], "injected_by": "api-gateway"},
                {
                    "X-Proxy-Target": "langflow",
                    "Via": "1.1 istio"
                }
            )
            return

        self._send(404, {"error": "not found"}, {"Via": "1.1 edge-proxy"})


def main() -> None:
    server = HTTPServer(("0.0.0.0", 8000), Handler)
    server.serve_forever()


if __name__ == "__main__":
    main()