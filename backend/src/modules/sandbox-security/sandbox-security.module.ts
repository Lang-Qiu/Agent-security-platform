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
import {
  createSandboxSecurityCapabilityAuthenticator
} from "./capability-authorizer.ts";
import {
  createSandboxSecurityCapabilityService
} from "./capability.service.ts";
import {
  createSandboxSecurityEvaluationService
} from "./evaluation.service.ts";
import { createSandboxSecurityAuditService } from "./audit.service.ts";
import {
  createSandboxSecurityCapabilityLimiterRegistry,
  createSandboxSecurityTokenBucket
} from "./token-bucket.ts";
import { createSandboxSecurityEngineConcurrencyLimiter } from "./engine-concurrency.ts";
import {
  createSandboxSecurityHmacService
} from "./hmac.ts";
import {
  createSandboxSecurityProductionEvaluationGateway
} from "./adapters/production-evaluation.gateway.ts";
import {
  openSandboxSecuritySqliteDatabase
} from "./adapters/sqlite/sqlite-database.ts";
import {
  createSqliteSandboxSecurityCapabilityRepository
} from "./adapters/sqlite/sqlite-capability.repository.ts";
import {
  createSqliteSandboxSecurityIdempotencyRepository,
  createSandboxSecurityIdempotencyMaintenance
} from "./adapters/sqlite/sqlite-idempotency.repository.ts";
import {
  createSqliteSandboxSecurityAuditRepository
} from "./adapters/sqlite/sqlite-audit.repository.ts";
import {
  createSandboxSecurityAuditProjector
} from "./audit-projector.ts";
import {
  toSandboxSecurityEngineRuntime
} from "./ports/runtime.ts";
import type { SandboxSecurityConfiguration } from "./sandbox-security.config.ts";
import { createSandboxSecurityNodeRuntimePort } from "./sandbox-security.config.ts";

const STARTUP_ERROR = "SANDBOX_SECURITY_STARTUP_FAILED";
const CONFIGURATION_ERROR = "SANDBOX_SECURITY_CONFIGURATION_INVALID";
const ENGINE_CONFIGURATION_ERROR = "sandbox_security_production_config_invalid";

function boundedStartupError(cause: unknown): Error {
  const causeName =
    cause !== null && typeof cause === "object" && "name" in cause
      ? (cause as { name?: unknown }).name
      : undefined;
  const code = causeName === ENGINE_CONFIGURATION_ERROR
    ? CONFIGURATION_ERROR
    : STARTUP_ERROR;
  const error = new Error(code, { cause });
  error.name = code;
  (error as Error & { code: string }).code = code;
  return error;
}

export {
  createSandboxSecuritySimulationEvaluationRequest
} from "./simulation-authority.ts";
export {
  createSandboxSecurityHmacService,
  createSandboxSecurityOpaqueCapability
} from "./hmac.ts";
export { normalizeSandboxSecurityCapabilityIssueRequest } from "./dto/capability.ts";
export {
  normalizeSandboxSecurityEnforcementAuditCapabilityIssueRequest
} from "./dto/enforcement-audit-capability.ts";
export type {
  SandboxSecurityEnforcementAuditCapabilityIssueRequest,
  SandboxSecurityEnforcementAuditCapabilityIssueResult,
  SandboxSecurityEnforcementAuditCapabilityPersistenceRecord,
  SandboxSecurityEnforcementAuditAuthorizedCapability
} from "./dto/enforcement-audit-capability.ts";
export type {
  SandboxSecurityPrivateAuthorizedCapability,
  SandboxSecurityPrivateCapabilityPersistenceRecord,
  SandboxSecurityPrivateCapabilityScope
} from "./sandbox-security.types.ts";
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
export {
  createSqliteSandboxSecurityEnforcementAuditRepository
} from "./adapters/sqlite/sqlite-enforcement-audit.repository.ts";

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

export async function createSandboxSecurityProductionModule(input: Readonly<{
  configuration: SandboxSecurityConfiguration;
  runtime?: SandboxSecurityRuntimePort;
}>): Promise<SandboxSecurityModule> {
  if (
    input === null ||
    typeof input !== "object" ||
    input.configuration === null ||
    typeof input.configuration !== "object"
  ) {
    throw boundedStartupError(new TypeError("sandbox security production configuration is required"));
  }

  const runtime = input.runtime ?? createSandboxSecurityNodeRuntimePort();
  const configuration = input.configuration;
  const hmac = createSandboxSecurityHmacService(
    new Uint8Array(configuration.deployment_hmac_key)
  );
  const auditProjector = createSandboxSecurityAuditProjector();
  let database: SqliteSandboxSecurityDatabase | null = null;
  let maintenance: SandboxSecurityIdempotencyMaintenance | null = null;

  const cleanup = async (): Promise<void> => {
    const errors: unknown[] = [];
    if (maintenance !== null) {
      try {
        maintenance.close();
      } catch (error) {
        errors.push(error);
      }
    }
    if (database !== null) {
      try {
        database.checkpointAndClose();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, "sandbox security production cleanup failed");
    }
  };

  try {
    database = openSandboxSecuritySqliteDatabase({
      path: configuration.storage_path,
      deployment_key_id: hmac.deploymentKeyId(),
      now: () => runtime.now()
    });
    const capabilityRepository = createSqliteSandboxSecurityCapabilityRepository({
      database
    });
    const idempotencyRepository = createSqliteSandboxSecurityIdempotencyRepository({
      database
    });
    const auditRepository = createSqliteSandboxSecurityAuditRepository({ database });
    maintenance = createSandboxSecurityIdempotencyMaintenance({
      repository: idempotencyRepository,
      runtime,
      audit_projector: auditProjector
    });
    const gateway = await createSandboxSecurityProductionEvaluationGateway({
      runtime: toSandboxSecurityEngineRuntime(runtime),
      production_mode: configuration.production_mode,
      hmac
    });
    const capabilityLimiters = createSandboxSecurityCapabilityLimiterRegistry({
      runtime,
      capacity: 3,
      refill_tokens_per_second: 0.2,
      sweep_every_admissions: 256,
      idle_expiry_ms: 3_600_000
    });
    const authenticator = createSandboxSecurityCapabilityAuthenticator({
      repository: capabilityRepository,
      hmac,
      production_mode: configuration.production_mode,
      bootstrap_admin_token: configuration.admin_bootstrap_token,
      now: () => runtime.now()
    });
    const capabilityService = createSandboxSecurityCapabilityService({
      repository: capabilityRepository,
      hmac,
      production_mode: configuration.production_mode,
      runtime,
      audit_projector: auditProjector,
      capability_limiters: capabilityLimiters
    });
    const auditService = createSandboxSecurityAuditService({
      repository: auditRepository,
      hmac,
      maintenance,
      runtime,
      audit_projector: auditProjector
    });
    const evaluationService = createSandboxSecurityEvaluationService({
      authorizer: authenticator,
      hmac,
      idempotency_repository: idempotencyRepository,
      maintenance,
      concurrency: createSandboxSecurityEngineConcurrencyLimiter(4),
      gateway,
      runtime,
      audit_projector: auditProjector
    });
    const globalBucket = createSandboxSecurityTokenBucket({
      capacity: 10,
      refill_tokens_per_second: 1,
      initial_monotonic_ms: runtime.monotonicNowMs()
    });
    const administratorBucket = createSandboxSecurityTokenBucket({
      capacity: 10,
      refill_tokens_per_second: 1,
      initial_monotonic_ms: runtime.monotonicNowMs()
    });
    return createSandboxSecurityModule({
      database,
      composition_binding: gateway.composition_binding,
      maintenance,
      authenticator,
      evaluation_service: evaluationService,
      capability_service: capabilityService,
      audit_service: auditService,
      audit_repository: auditRepository,
      audit_projector: auditProjector,
      global_bucket: globalBucket,
      administrator_bucket: administratorBucket,
      capability_limiters: capabilityLimiters,
      runtime
    });
  } catch (error) {
    try {
      await cleanup();
    } catch {
      // Preserve the bounded startup error while continuing all cleanup.
    }
    throw boundedStartupError(error);
  }
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
      const errors: unknown[] = [];
      try {
        dependencies.maintenance.close();
      } catch (error) {
        errors.push(error);
      }
      try {
        dependencies.database.checkpointAndClose();
      } catch (error) {
        errors.push(error);
      }
      if (errors.length > 0) {
        throw new AggregateError(errors, "sandbox security module close failed");
      }
      closed = true;
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
