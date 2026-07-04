// Typed loader for the versioned review-demo content catalog.
//
// This module only re-exposes the catalog with local types matching the
// JSON 1:1. It does not duplicate the Chinese strings — the source of truth
// stays in samples/track1/review-demo/content.zh-CN.json, gated by
// tests/repository/track1-review-demo-content.spec.ts. It does not redefine
// any shared/ DTO name.

import rawContent from "../../../samples/track1/review-demo/content.zh-CN.json";

export interface ReviewDemoProduct {
  name: string;
  positioning: string;
  tagline: string;
  summary: string;
}

export interface ReviewDemoSourceNotice {
  label: string;
  data_source: string;
  accepted_baseline: boolean;
  summary: string;
  replacement_rule: string;
}

export interface ReviewTourStep {
  id: string;
  order: number;
  title: string;
  evaluator_question: string;
  presenter_guidance: string;
  target_surface: string;
  duration_seconds: number;
}

export interface ReviewCapability {
  id: string;
  title: string;
  summary: string;
}

export interface ReviewScenario {
  scenario_id: string;
  agent_id: string;
  display_name: string;
  evaluator_question: string;
  controlled_attack_objective: string;
  control_mechanism: string;
  evidence_surfaces: string[];
  residual_risk: string;
}

export interface ReviewMetricBinding {
  key: string;
  label: string;
  description: string;
}

export interface ReviewEvidenceSurface {
  id: string;
  title: string;
  description: string;
  fixture_state: string;
}

export interface ReviewSafetyBoundaryItem {
  id: string;
  statement: string;
}

export interface ReviewFaqItem {
  id: string;
  question: string;
  answer: string;
}

export interface ReviewDemoContent {
  schema_version: string;
  locale: string;
  product: ReviewDemoProduct;
  source_notice: ReviewDemoSourceNotice;
  review_tour: ReviewTourStep[];
  capabilities: ReviewCapability[];
  scenarios: ReviewScenario[];
  metric_bindings: ReviewMetricBinding[];
  evidence_surfaces: ReviewEvidenceSurface[];
  safety_boundary: ReviewSafetyBoundaryItem[];
  frequently_asked_questions: ReviewFaqItem[];
}

export const reviewDemoContent: ReviewDemoContent =
  rawContent as ReviewDemoContent;

export function getReviewMetricBindings(): ReviewMetricBinding[] {
  return reviewDemoContent.metric_bindings;
}
