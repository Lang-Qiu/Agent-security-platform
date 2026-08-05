import type { IncomingMessage } from "node:http";

import type { HttpResponse } from "../../common/http/http-response.ts";
import type { SandboxSecurityAuditRepository } from "./ports/audit.repository.ts";
import type { SandboxSecurityEvaluationGateway } from "./ports/evaluation.gateway.ts";
import type { SandboxSecurityRuntimePort } from "./ports/runtime.ts";
import type { SqliteSandboxSecurityDatabase } from "./ports/sqlite-database.ts";
import type {
  SandboxSecurityAuditProjector,
  SandboxSecurityAuditService,
  SandboxSecurityCapabilityAuthenticator,
  SandboxSecurityCapabilityLimiterRegistry,
  SandboxSecurityCapabilityService,
  SandboxSecurityEngineConcurrencyLimiter,
  SandboxSecurityEvaluationService,
  SandboxSecurityIdempotencyMaintenance,
  SandboxSecurityTokenBucket
} from "./sandbox-security.types.ts";

export {
  createSandboxSecuritySimulationEvaluationRequest
} from "./simulation-authority.ts";
export {
  createSandboxSecurityHmacService,
  createSandboxSecurityOpaqueCapability
} from "./hmac.ts";
export { normalizeSandboxSecurityCapabilityIssueRequest } from "./dto/capability.ts";
export {
  createSandboxSecurityCapabilityAuthenticator
} from "./capability-authorizer.ts";
export {
  createSandboxSecurityCapabilityService
} from "./capability.service.ts";
export {
  createSandboxSecurityCapabilityLimiterRegistry,
  createSandboxSecurityTokenBucket
} from "./token-bucket.ts";
export {
  createSandboxSecurityEngineConcurrencyLimiter
} from "./engine-concurrency.ts";
export {
  createSandboxSecurityAuditProjector
} from "./audit-projector.ts";
export { openSandboxSecuritySqliteDatabase } from "./adapters/sqlite/sqlite-database.ts";
export {
  createSqliteSandboxSecurityCapabilityRepository
} from "./adapters/sqlite/sqlite-capability.repository.ts";
export {
  createSqliteSandboxSecurityIdempotencyRepository,
  createSandboxSecurityIdempotencyMaintenance
} from "./adapters/sqlite/sqlite-idempotency.repository.ts";
export { createSqliteSandboxSecurityAuditRepository } from "./adapters/sqlite/sqlite-audit.repository.ts";

export { toSandboxSecurityEngineRuntime } from "./ports/runtime.ts";
export {
  SandboxSecurityClaimCleanupError,
  SandboxSecurityServiceError,
  createSandboxSecurityServiceError,
  isSandboxSecurityServiceError
} from "./sandbox-security.errors.ts";

export interface SandboxSecurityPublicController {
  evaluate(request: IncomingMessage, requestId: string): Promise<HttpResponse>;
  listAuditEvents(
    request: IncomingMessage,
    url: URL,
    requestId: string
  ): Promise<HttpResponse>;
}

export interface SandboxSecurityAdminController {
  issue(request: IncomingMessage, requestId: string): Promise<HttpResponse>;
  revoke(
    request: IncomingMessage,
    rawCapabilityIdSegment: string,
    requestId: string
  ): Promise<HttpResponse>;
  purge(request: IncomingMessage, requestId: string): Promise<HttpResponse>;
}

export interface SandboxSecurityModule {
  publicController: SandboxSecurityPublicController;
  adminController: SandboxSecurityAdminController;
  close(): Promise<void>;
}

export interface SandboxSecurityModuleDependencies {
  database: SqliteSandboxSecurityDatabase;
  composition_binding: string;
  maintenance: SandboxSecurityIdempotencyMaintenance;
  authenticator: SandboxSecurityCapabilityAuthenticator;
  evaluation_service: SandboxSecurityEvaluationService;
  capability_service: SandboxSecurityCapabilityService;
  audit_service: SandboxSecurityAuditService;
  audit_repository: SandboxSecurityAuditRepository;
  audit_projector: SandboxSecurityAuditProjector;
  global_bucket: SandboxSecurityTokenBucket;
  administrator_bucket: SandboxSecurityTokenBucket;
  capability_limiters: SandboxSecurityCapabilityLimiterRegistry;
  runtime: SandboxSecurityRuntimePort;
}

// Keep the module boundary type-only in Phase 1. Concrete service/controller
// factories are added by their owning later tasks.
export type {
  SandboxSecurityAuditProjector,
  SandboxSecurityAuditService,
  SandboxSecurityCapabilityAuthenticator,
  SandboxSecurityCapabilityLimiterRegistry,
  SandboxSecurityCapabilityService,
  SandboxSecurityEngineConcurrencyLimiter,
  SandboxSecurityEvaluationGateway,
  SandboxSecurityEvaluationService,
  SandboxSecurityIdempotencyMaintenance,
  SandboxSecurityTokenBucket,
  SandboxSecurityRuntimePort,
  SqliteSandboxSecurityDatabase
};
