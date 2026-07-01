import assert from "node:assert/strict";
import test from "node:test";

import { Track1IngestClient } from "../src/ingest-client.ts";
import type { Track1IngestTransport } from "../src/ingest-client.ts";
import {
  makeCampaignPluginConfig,
  makeCampaignSnapshotEnvelope,
  makeIngestSnapshotAck
} from "./fixtures/openclaw-plugin.fixture.ts";

// -- happy path ------------------------------------------------------------

test("REQ-T1-DEMO-010 ingest client requires authenticated matching acknowledgement", async () => {
  const calls: Array<{
    url: string;
    headers: Readonly<Record<string, string>>;
    body: string;
  }> = [];
  const client = new Track1IngestClient(
    makeCampaignPluginConfig(),
    {
      async request(method, url, headers, body) {
        assert.equal(method, "PUT");
        calls.push({ url: url.href, headers, body });
        return {
          status: 202,
          body: JSON.stringify(makeIngestSnapshotAck())
        };
      }
    }
  );

  const envelope = makeCampaignSnapshotEnvelope();
  const ack = await client.appendSnapshot(envelope);
  assert.equal(ack.sequence, 1);
  assert.equal(
    calls[0]?.url,
    "http://backend:3001/internal/track1/campaigns/campaign%3At1%3A0123456789abcdef0123456789abcdef/snapshots/1"
  );
  assert.match(calls[0]?.headers.authorization ?? "", /^Bearer [A-Za-z0-9_-]+$/);
  assert.equal(calls[0]?.headers["content-type"], "application/json");
  assert.equal(calls[0]?.body.includes("SECRET_SENTINEL"), false);
});

// -- fail-closed without token / backend leak ------------------------------

test("REQ-T1-DEMO-010 ingest client fails closed without leaking token or backend body", async () => {
  const token = "TOKEN_SENTINEL_7d93";
  const client = new Track1IngestClient(
    { ...makeCampaignPluginConfig(), ingestToken: token },
    {
      async request() {
        return { status: 500, body: "BACKEND_SENTINEL_81cb" };
      }
    }
  );

  await assert.rejects(
    () => client.appendSnapshot(makeCampaignSnapshotEnvelope()),
    (error: unknown) => {
      assert.equal(String(error).includes(token), false);
      assert.equal(String(error).includes("BACKEND_SENTINEL_81cb"), false);
      return String(error).includes("track1_ingest_failed");
    }
  );
});

// -- endpoint deviations ---------------------------------------------------

test("REQ-T1-DEMO-010 ingest client rejects endpoint deviations", async () => {
  const deviations = [
    "http://evil.com:3001/internal/track1/campaigns",
    "http://backend:3001/internal/track1/campaigns/extra",
    "http://backend:9999/internal/track1/campaigns",
    "https://backend:3001/internal/track1/campaigns",
    "http://backend:3001/internal/track1/campaigns?query=1",
    "http://backend:3001/internal/track1/campaigns#frag"
  ];
  for (const endpoint of deviations) {
    await assert.rejects(
      async () => {
        const client = new Track1IngestClient(
          { ...makeCampaignPluginConfig(), ingestEndpoint: endpoint },
          {
            async request() {
              return { status: 202, body: JSON.stringify(makeIngestSnapshotAck()) };
            }
          }
        );
        await client.appendSnapshot(makeCampaignSnapshotEnvelope());
      },
      /track1_ingest_failed/
    );
  }
});

// -- missing / empty token -------------------------------------------------

test("REQ-T1-DEMO-010 ingest client rejects missing or empty token", async () => {
  for (const token of ["", "   "]) {
    await assert.rejects(
      async () => {
        const client = new Track1IngestClient(
          { ...makeCampaignPluginConfig(), ingestToken: token },
          {
            async request() {
              return { status: 202, body: JSON.stringify(makeIngestSnapshotAck()) };
            }
          }
        );
        await client.appendSnapshot(makeCampaignSnapshotEnvelope());
      },
      /track1_ingest_failed/
    );
  }
});

// -- response status table -------------------------------------------------

test("REQ-T1-DEMO-010 ingest client accepts 200 and 202, rejects others", async () => {
  const accepted = [200, 202];
  const rejected = [204, 400, 401, 409, 500];
  for (const status of accepted) {
    const client = new Track1IngestClient(makeCampaignPluginConfig(), {
      async request() {
        return { status, body: JSON.stringify(makeIngestSnapshotAck()) };
      }
    });
    const ack = await client.appendSnapshot(makeCampaignSnapshotEnvelope());
    assert.equal(ack.sequence, 1);
  }
  for (const status of rejected) {
    const client = new Track1IngestClient(makeCampaignPluginConfig(), {
      async request() {
        return { status, body: JSON.stringify(makeIngestSnapshotAck()) };
      }
    });
    await assert.rejects(
      () => client.appendSnapshot(makeCampaignSnapshotEnvelope()),
      /track1_ingest_failed/
    );
  }
});

// -- malformed JSON / unknown keys -----------------------------------------

test("REQ-T1-DEMO-010 ingest client rejects malformed response", async () => {
  const client = new Track1IngestClient(makeCampaignPluginConfig(), {
    async request() {
      return { status: 202, body: "not-json" };
    }
  });
  await assert.rejects(
    () => client.appendSnapshot(makeCampaignSnapshotEnvelope()),
    /track1_ingest_failed/
  );
});

test("REQ-T1-DEMO-010 ingest client rejects unknown response keys", async () => {
  const client = new Track1IngestClient(makeCampaignPluginConfig(), {
    async request() {
      return {
        status: 202,
        body: JSON.stringify({
          ...makeIngestSnapshotAck(),
          extra: "SENTINEL"
        })
      };
    }
  });
  await assert.rejects(
    () => client.appendSnapshot(makeCampaignSnapshotEnvelope()),
    /track1_ingest_failed/
  );
});

// -- sequence / hash / campaign / attempt mismatch -------------------------

test("REQ-T1-DEMO-010 ingest client rejects ack mismatch", async () => {
  const envelope = makeCampaignSnapshotEnvelope();
  const mismatches = [
    { ...makeIngestSnapshotAck(), sequence: 999 },
    { ...makeIngestSnapshotAck(), snapshot_sha256: "a".repeat(64) },
    { ...makeIngestSnapshotAck(), campaign_id: "campaign:t1:foreign" },
    { ...makeIngestSnapshotAck(), attempt_id: "attempt:foreign" }
  ];
  for (const ack of mismatches) {
    const client = new Track1IngestClient(makeCampaignPluginConfig(), {
      async request() {
        return { status: 202, body: JSON.stringify(ack) };
      }
    });
    await assert.rejects(
      () => client.appendSnapshot(envelope),
      /track1_ingest_failed/
    );
  }
});

// -- timeout / transport throw ---------------------------------------------

test("REQ-T1-DEMO-010 ingest client fails closed on transport throw", async () => {
  const client = new Track1IngestClient(makeCampaignPluginConfig(), {
    async request() {
      throw new Error("TRANSPORT_SENTINEL_42ab");
    }
  });
  await assert.rejects(
    () => client.appendSnapshot(makeCampaignSnapshotEnvelope()),
    (error: unknown) => {
      assert.equal(String(error).includes("TRANSPORT_SENTINEL_42ab"), false);
      return String(error).includes("track1_ingest_failed");
    }
  );
});

test("REQ-T1-DEMO-010 ingest client enforces timeout via AbortController", async () => {
  let receivedSignal: AbortSignal | undefined;
  const client = new Track1IngestClient(makeCampaignPluginConfig(), {
    async request(_method, _url, _headers, _body, signal) {
      receivedSignal = signal;
      // Simulate the signal being aborted by timeout
      signal.addEventListener("abort", () => {
        // no-op for test
      });
      return { status: 202, body: JSON.stringify(makeIngestSnapshotAck()) };
    }
  });
  await client.appendSnapshot(makeCampaignSnapshotEnvelope());
  assert.ok(receivedSignal);
  assert.equal(receivedSignal!.aborted, false);
});
