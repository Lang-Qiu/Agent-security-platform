// Minimal Track 1 backend for Phase 4 integration testing
// Implements Phase 2 campaign ingest contract with proper authorization and data structure

const express = require("express");
const crypto = require("crypto");

const app = express();
app.use(express.json({ limit: "1mb" })); // Phase 2 limit

// In-memory storage
const campaigns = new Map();
const snapshots = new Map();

// Expected token from environment
const EXPECTED_TOKEN = process.env.TRACK1_INGEST_TOKEN || "dev-token";

// Token verification middleware
function verifyToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid authorization header" });
  }
  const token = auth.substring(7);
  if (token !== EXPECTED_TOKEN) {
    return res.status(403).json({ error: "Invalid token" });
  }
  next();
}

// Public health endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", port: "public" });
});

// Internal ingest API
const internal = express();
internal.use(express.json({ limit: "1mb" }));

internal.get("/health", (req, res) => {
  res.json({ status: "ok", port: "internal" });
});

// POST /internal/track1/campaigns - Create campaign
internal.post("/internal/track1/campaigns", verifyToken, (req, res) => {
  const { campaign_id, campaign_manifest_sha256, agent_configs, total_cases } = req.body;

  if (!campaign_id || !campaign_manifest_sha256) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Initialize campaign with agent structure
  const agents = (agent_configs || []).map(cfg => ({
    agent_id: cfg.agent_id,
    cases: []
  }));

  campaigns.set(campaign_id, {
    campaign_id,
    campaign_manifest_sha256,
    agent_configs: agent_configs || [],
    total_cases: total_cases || 0,
    status: "running",
    agents,
    created_at: new Date().toISOString()
  });

  res.status(201).json({ campaign_id });
});

// POST /internal/track1/campaigns/:id/attempts - Record attempt
internal.post("/internal/track1/campaigns/:campaignId/attempts", verifyToken, (req, res) => {
  const { campaignId } = req.params;
  const attemptData = req.body;

  const campaign = campaigns.get(campaignId);
  if (!campaign) {
    return res.status(404).json({ error: "Campaign not found" });
  }

  const { agent_id, case_id, attempt_id, status, policy_action } = attemptData;

  // Find or create agent
  let agent = campaign.agents.find(a => a.agent_id === agent_id);
  if (!agent) {
    agent = { agent_id, cases: [] };
    campaign.agents.push(agent);
  }

  // Find or create case
  let caseEntry = agent.cases.find(c => c.case_id === case_id);
  if (!caseEntry) {
    caseEntry = { case_id, attempts: [] };
    agent.cases.push(caseEntry);
  }

  // Add or update attempt
  const existingAttemptIndex = caseEntry.attempts.findIndex(a => a.attempt_id === attempt_id);
  const attemptSummary = {
    attempt_id,
    status,
    policy_action,
    recorded_at: new Date().toISOString()
  };

  if (existingAttemptIndex >= 0) {
    caseEntry.attempts[existingAttemptIndex] = attemptSummary;
  } else {
    caseEntry.attempts.push(attemptSummary);
  }

  campaigns.set(campaignId, campaign);
  res.status(201).json({ attempt_id });
});

// POST /internal/track1/campaigns/:id/snapshots - Record snapshots
internal.post("/internal/track1/campaigns/:campaignId/snapshots", verifyToken, (req, res) => {
  const { campaignId } = req.params;
  const { attempt_id, snapshot_type, snapshot_data } = req.body;

  if (!campaigns.has(campaignId)) {
    return res.status(404).json({ error: "Campaign not found" });
  }

  const snapshot_id = `snapshot:${attempt_id}:${snapshot_type}:${Date.now()}`;
  snapshots.set(snapshot_id, {
    snapshot_id,
    campaign_id: campaignId,
    attempt_id,
    snapshot_type,
    snapshot_data,
    recorded_at: new Date().toISOString()
  });

  res.status(201).json({ snapshot_id });
});

// POST /internal/track1/campaigns/:id/finalize - Finalize campaign
internal.post("/internal/track1/campaigns/:campaignId/finalize", verifyToken, (req, res) => {
  const { campaignId } = req.params;
  const campaign = campaigns.get(campaignId);

  if (!campaign) {
    return res.status(404).json({ error: "Campaign not found" });
  }

  // Count terminal cases (9 states: passed, failed, skipped, timeout, error, crashed, blocked, degraded, unknown)
  let terminalCases = 0;
  for (const agent of campaign.agents) {
    for (const caseEntry of agent.cases) {
      const lastAttempt = caseEntry.attempts[caseEntry.attempts.length - 1];
      if (lastAttempt && ["passed", "failed", "skipped", "timeout", "error", "crashed", "blocked", "degraded", "unknown"].includes(lastAttempt.status)) {
        terminalCases++;
      }
    }
  }

  // Only finalize if all cases are terminal
  if (terminalCases < campaign.total_cases) {
    return res.status(400).json({
      error: "Cannot finalize: not all cases are in terminal state",
      terminal_cases: terminalCases,
      total_cases: campaign.total_cases
    });
  }

  campaign.status = "completed";
  campaign.finalized_at = new Date().toISOString();
  campaigns.set(campaignId, campaign);

  res.json({ campaign_id: campaignId, status: "completed" });
});

// Supervision API (for polling attempt completion)
app.get("/api/supervision/campaigns/:campaignId", (req, res) => {
  const { campaignId } = req.params;
  const campaign = campaigns.get(campaignId);

  if (!campaign) {
    return res.status(404).json({ error: "Campaign not found" });
  }

  // Return in Phase 2 format: { success: true, data: { agents: [...] } }
  res.json({
    success: true,
    data: {
      campaign_id: campaign.campaign_id,
      status: campaign.status,
      agents: campaign.agents,
      total_cases: campaign.total_cases,
      created_at: campaign.created_at,
      finalized_at: campaign.finalized_at
    }
  });
});

// Start servers
app.listen(3000, "0.0.0.0", () => {
  console.log("[backend] Public API listening on 0.0.0.0:3000");
  console.log("[backend] Expected ingest token:", EXPECTED_TOKEN.substring(0, 8) + "...");
});

internal.listen(3001, "0.0.0.0", () => {
  console.log("[backend] Internal ingest API listening on 0.0.0.0:3001");
});
