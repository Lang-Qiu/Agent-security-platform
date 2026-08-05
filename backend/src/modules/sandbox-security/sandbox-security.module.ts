import type { IncomingMessage } from "node:http";

import type { HttpResponse } from "../../common/http/http-response.ts";
import { createSandboxSecurityAdminController } from "./sandbox-security-admin.controller.ts";
import { createSandboxSecurityController } from "./sandbox-security.controller.ts";
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
  createSandboxSecurityEvaluationService
} from "./evaluation.service.ts";
export {
  createSandboxSecurityAuditService
} from "./audit.service.ts";
export {
  createSandboxSecurityCapabilityLimiterRegistry,
  createSandboxSecurityTokenBucket
} from "./token-bucket.ts";
export {
  createSandboxSecurityEngineConcurrencyLimiter
} from "./engine-concurrency.ts";
export {
  createSandboxSecurityProductionEvaluationGateway
} from "./adapters/production-evaluation.gateway.ts";
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
export {
  SandboxSecurityHttpError,
  sandboxSecurityHttpErrorResponse,
  sandboxSecurityServiceErrorToHttpError,
  readSandboxSecurityBearer,
  readSandboxSecurityIdempotencyKey,
  readSandboxSecurityJsonBody,
  assertSandboxSecurityBodyless,
  parseSandboxSecurityAuditQuery
} from "./http-admission.ts";
export type { SandboxSecurityHttpErrorCode } from "./http-admission.ts";
export { createSandboxSecurityController } from "./sandbox-security.controller.ts";
export {
  createSandboxSecurityAdminController
} from "./sandbox-security-admin.controller.ts";

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

/**
 * Assemble the sandbox-security boundary from already constructed services.
 *
 * Environment/configuration and persistence construction belong to the
 * composition root. Keeping this factory injection-only makes the public and
 * internal listeners share one controller/service graph and gives the module
 * one explicit resource owner for shutdown.
 */
export function createSandboxSecurityModule(
  dependencies: Readonly<SandboxSecurityModuleDependencies>
): SandboxSecurityModule {
  const publicController = createSandboxSecurityController({
    composition_binding: dependencies.composition_binding,
    authenticator: dependencies.authenticator,
    evaluation_service: dependencies.evaluation_service,
    audit_service: dependencies.audit_service,
    maintenance: dependencies.maintenance,
    global_bucket: dependencies.global_bucket,
    capability_limiters: dependencies.capability_limiters,
    audit_projector: dependencies.audit_projector,
    audit_repository: dependencies.audit_repository,
    runtime: dependencies.runtime
  });
  const adminController = createSandboxSecurityAdminController({
    authenticator: dependencies.authenticator,
    capability_service: dependencies.capability_service,
    audit_service: dependencies.audit_service,
    administrator_bucket: dependencies.administrator_bucket,
    runtime: dependencies.runtime
  });

  let closed = false;
  return {
    publicController,
    adminController,
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      dependencies.maintenance.close();
      dependencies.database.checkpointAndClose();
    }
  };
}

// Re-export the boundary contracts so composition roots and tests can assemble
// the module without importing concrete adapter implementations.
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
