import assert from "node:assert/strict";
import { test } from "node:test";

import type { FeatureData, FingerprintMatchItem, ProtocolInfo, Asset, PortInfo, ScanContext } from "../../../shared/types/asset-scan.ts";
import { AssetScanPipeline } from "../src/runtime/pipeline.ts";

test("asset scan pipeline builds scan context from discovery, port scan and protocol identification", async () => {
  const contexts: ScanContext[] = [];

  const pipeline = new AssetScanPipeline("workspace-root", {
    discoveryService: {
      discover: async () => [
        {
          asset_id: "asset_001",
          ip: "127.0.0.1",
          domain: "localhost",
          source: ["dns"],
          tags: ["candidate-agent"],
          timestamp: "2026-04-13T10:00:00Z"
        } satisfies Asset
      ]
    },
    portScanService: {
      scan: async () =>
        ({
          ip: "127.0.0.1",
          ports: [
            { port: 11434, status: "open" },
            { port: 443, status: "closed" }
          ]
        }) satisfies PortInfo
    },
    protocolIdentificationService: {
      identify: async () =>
        ({
          ip: "127.0.0.1",
          port_protocols: [
            {
              port: 11434,
              protocol: "http",
              subprotocol: "http/1.1",
              service: "ollama"
            }
          ],
          confidence: 0.91
        }) satisfies ProtocolInfo
    },
    probeService: {
      execute: async (context: ScanContext): Promise<FeatureData> => {
        contexts.push(context);
        return { features: [], endpoints: [], probe_hits: [] };
      }
    },
    fingerprintService: {
      evaluate: (): FingerprintMatchItem[] => []
    },
    classificationService: {
      buildResult: (_targetUrl, context) => ({
        target: {
          target_type: "url",
          target_value: "http://localhost:11434"
        },
        asset: {
          ip: context.ip,
          domain: context.domain,
          source: ["dns"],
          timestamp: "2026-04-13T10:00:00Z"
        },
        network: {
          open_ports: [],
          protocols: context.protocols
        },
        application: {
          http_endpoints: [],
          auth: {
            auth_detected: false,
            auth_type: "none"
          }
        },
        fingerprints: {},
        inferred_attributes: {},
        findings: []
      })
    }
  });

  const result = await pipeline.run("http://localhost:11434");

  assert.equal(contexts.length, 1);
  assert.deepEqual(contexts[0], {
    ip: "127.0.0.1",
    domain: "localhost",
    asset: {
      asset_id: "asset_001",
      ip: "127.0.0.1",
      domain: "localhost",
      source: ["dns"],
      tags: ["candidate-agent"],
      timestamp: "2026-04-13T10:00:00Z"
    },
    discoveredPorts: [11434],
    identifiedProtocols: {
      11434: "http"
    },
    protocols: [
      {
        port: 11434,
        protocol: "http",
        subprotocol: "http/1.1",
        service: "ollama"
      }
    ]
  });

  assert.deepEqual(result.network?.protocols, [
    {
      port: 11434,
      protocol: "http",
      subprotocol: "http/1.1",
      service: "ollama"
    }
  ]);
});
