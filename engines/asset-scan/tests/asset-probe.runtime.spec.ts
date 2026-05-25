import assert from "node:assert/strict";
import { test } from "node:test";

import { AssetDiscoveryService } from "../src/runtime/asset-discovery.service.ts";
import { PortScanService } from "../src/runtime/port-scan.service.ts";
import { ProtocolIdentificationService } from "../src/runtime/protocol-identification.service.ts";

test("asset discovery resolves seeds into candidate assets with source attribution", async () => {
  const discovery = new AssetDiscoveryService({
    dnsLookup: async (host) => {
      if (host === "api.example.com") {
        return ["1.2.3.4"];
      }

      return [];
    },
    organizationLookup: async (keyword) => {
      if (keyword === "Example Corp") {
        return [
          {
            domain: "api.xxx.com",
            ip: "1.2.3.4",
            source: ["osint", "crt"]
          }
        ];
      }

      return [];
    },
    now: () => "2026-04-13T10:00:00Z"
  });

  const assets = await discovery.discover({
    seed: ["api.example.com", "1.2.3.4", "Example Corp"]
  });

  assert.deepEqual(assets, [
    {
      asset_id: "asset_001",
      ip: "1.2.3.4",
      domain: "api.example.com",
      source: ["dns", "seed", "osint", "crt"],
      tags: ["candidate-agent"],
      timestamp: "2026-04-13T10:00:00Z"
    }
  ]);
});

test("port scan reports relevant port status and preserves closed or filtered ports", async () => {
  const portScan = new PortScanService({
    ports: [80, 443, 50051],
    connect: async ({ port }) => {
      if (port === 443) {
        return "open";
      }

      if (port === 50051) {
        return "filtered";
      }

      return "closed";
    }
  });

  const result = await portScan.scan({
    ip: "1.2.3.4"
  });

  assert.deepEqual(result, {
    ip: "1.2.3.4",
    ports: [
      { port: 80, status: "closed" },
      { port: 443, status: "open" },
      { port: 50051, status: "filtered" }
    ]
  });
});

test("protocol identification returns protocol, service, tls metadata and confidence", async () => {
  const identify = new ProtocolIdentificationService({
    inspect: async ({ port }) => {
      if (port === 443) {
        return {
          protocol: "https",
          subprotocol: "http/1.1",
          service: "uvicorn",
          tls: {
            version: "TLS1.3",
            alpn: ["h2", "http/1.1"]
          },
          confidence: 0.85
        };
      }

      return {
        protocol: "grpc",
        subprotocol: "grpc",
        service: "unknown",
        confidence: 0.7
      };
    }
  });

  const result = await identify.identify({
    ip: "1.2.3.4",
    ports: [443, 50051]
  });

  assert.deepEqual(result, {
    ip: "1.2.3.4",
    port_protocols: [
      {
        port: 443,
        protocol: "https",
        subprotocol: "http/1.1",
        service: "uvicorn",
        tls: {
          version: "TLS1.3",
          alpn: ["h2", "http/1.1"]
        }
      },
      {
        port: 50051,
        protocol: "grpc",
        subprotocol: "grpc",
        service: "unknown"
      }
    ],
    confidence: 0.78
  });
});
