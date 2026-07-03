// Minimal Track 1 backend for Phase 4 integration testing
// Only implements the campaign ingest endpoints needed for runner → backend flow

const express = require("express");
const crypto = require("crypto");

const app = express();
app.use(express.json({ limit: "10mb" }));

// In-memory storage for campaigns
const campaigns = new Map();
const attempts = new Map();

// Public health endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", port: "public" });
});

// Internal ingest API
const internal = express();
internal.use(express.json({ limit: "10mb" }));

internal.get("/health", (req, res) => {
  res.json({ status: "ok", port: "internal" });
});

// POST /internal/track1/campaigns - Create campaign
internal.post("/internal/track1/campaigns", (req, res) => {
  const { campaign_id, campaign_manifest_sha256, agent_configs, total_cases } = req.body;

  if (!campaign_id || !campaign_manifest_sha256) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  campaigns.set(campaign_id, {
    campaign_id,
    campaign_manifest_sha256,
    agent_configs: agent_configs || [],
    total_cases: total_cases || 0,
    status: "running",
    created_at: new Date().toISOString()
  });

  res.status(201).json({ campaign_id });
});

// POST /internal/track1/campaigns/:id/attempts - Record attempt
internal.post("/internal/track1/campaigns/:campaignId/attempts", (req, res) => {
  const { campaignId } = req.params;
  const attemptData = req.body;

  if (!campaigns.has(campaignId)) {
    return res.status(404).json({ error: "Campaign not found" });
  }

  const attempt_id = attemptData.attempt_id || crypto.randomBytes(16).toString("hex");
  attempts.set(attempt_id, {
    ...attemptData,
    attempt_id,
    campaign_id: campaignId,
    recorded_at: new Date().toISOString()
  });

  res.status(201).json({ attempt_id });
});

// POST /internal/track1/campaigns/:id/finalize - Finalize campaign
internal.post("/internal/track1/campaigns/:campaignId/finalize", (req, res) => {
  const { campaignId } = req.params;
  const campaign = campaigns.get(campaignId);

  if (!campaign) {
    return res.status(404).json({ error: "Campaign not found" });
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

  // Return campaign with attempts
  const campaignAttempts = Array.from(attempts.values())
    .filter(a => a.campaign_id === campaignId);

  res.json({
    ...campaign,
    attempts: campaignAttempts
  });
});

// Start servers
app.listen(3000, "0.0.0.0", () => {
  console.log("[backend] Public API listening on 0.0.0.0:3000");
});

internal.listen(3001, "0.0.0.0", () => {
  console.log("[backend] Internal ingest API listening on 0.0.0.0:3001");
});
