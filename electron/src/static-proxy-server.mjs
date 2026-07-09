import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2"
};

// Pure routing decision, kept separate from the HTTP server for unit testing.
// Any path under /api or /health is proxied to the backend; everything else
// is served from the static frontend build, falling back to index.html for
// client-side routing (react-router).
export function decideRouteKind(pathname) {
  if (pathname.startsWith("/api/") || pathname === "/health") {
    return "proxy";
  }
  return "static";
}

export function resolveStaticFilePath(staticRoot, pathname) {
  const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const candidate = join(staticRoot, safePath);
  if (candidate.endsWith("/") || !existsSync(candidate) || statSync(candidate).isDirectory()) {
    return join(staticRoot, "index.html");
  }
  return candidate;
}

export function createStaticProxyServer(options) {
  const { staticRoot, backendOrigin } = options;

  return createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const kind = decideRouteKind(url.pathname);

    if (kind === "proxy") {
      const targetUrl = new URL(url.pathname + url.search, backendOrigin);
      const chunks = [];
      request.on("data", (chunk) => chunks.push(chunk));
      request.on("end", () => {
        const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
        fetch(targetUrl, {
          method: request.method,
          headers: { ...request.headers, host: undefined },
          body
        })
          .then(async (proxied) => {
            response.statusCode = proxied.status;
            proxied.headers.forEach((value, key) => response.setHeader(key, value));
            response.end(Buffer.from(await proxied.arrayBuffer()));
          })
          .catch((error) => {
            response.statusCode = 502;
            response.setHeader("content-type", "application/json");
            response.end(JSON.stringify({ error: "Backend proxy failed", detail: String(error) }));
          });
      });
      return;
    }

    const filePath = resolveStaticFilePath(staticRoot, url.pathname);
    const contentType = MIME_TYPES[extname(filePath)] ?? "application/octet-stream";
    response.setHeader("content-type", contentType);
    createReadStream(filePath)
      .on("error", () => {
        response.statusCode = 404;
        response.end("Not found");
      })
      .pipe(response);
  });
}
