import { useState } from "react";
import { Alert, Button, Space, Typography } from "antd";

import type { SandboxSecurityAuditEvent } from "../../../shared/types/sandbox-security-api";
import { AuditCursorPager } from "../components/sandbox-security/AuditCursorPager";
import { AuditEventTable } from "../components/sandbox-security/AuditEventTable";
import { CapabilitySessionPanel } from "../components/sandbox-security/CapabilitySessionPanel";
import {
  describeSandboxSecurityFailure,
  type SandboxSecurityFailureCopy
} from "../content/sandbox-security-copy";
import { readSandboxSecurityAuditPage } from "../services/sandbox-security-service";
import type { SandboxSecurityCallResult } from "../services/api-client";
import type { SandboxSecurityAuditPage as AuditPageData } from "../../../shared/types/sandbox-security-api";

export interface SandboxSecurityAuditPageProps {
  fetchImpl?: typeof fetch;
}

type ErrorResult =
  | { kind: "error"; httpStatus: number; errorCode: string | null; retryAfterSeconds: number | null }
  | { kind: "invalid" }
  | { kind: "unavailable" };

const AUDIT_PAGE_LIMIT = 50;

/**
 * Read-only audit event page. Owns the capability token (memory only), the
 * loaded events, the forward cursor, and the error. It sends no
 * `Idempotency-Key` — that header belongs only to the evaluation route. The
 * opaque cursor travels in the request query string but is never written into
 * the browser URL, storage, or a log.
 */
export function SandboxSecurityAuditPage({ fetchImpl }: SandboxSecurityAuditPageProps) {
  const [capabilityToken, setCapabilityToken] = useState("");
  const [events, setEvents] = useState<SandboxSecurityAuditEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ErrorResult | null>(null);
  const [loaded, setLoaded] = useState(false);

  const failureCopy: SandboxSecurityFailureCopy | null = error
    ? describeSandboxSecurityFailure(error)
    : null;
  const requiresNewCapability = failureCopy?.requiresNewCapability ?? false;

  const runRead = async (cursor?: string) => {
    setLoading(true);
    const result: SandboxSecurityCallResult<AuditPageData> =
      await readSandboxSecurityAuditPage({
        capabilityToken,
        limit: AUDIT_PAGE_LIMIT,
        cursor,
        options: fetchImpl ? { fetchImpl } : undefined
      });
    setLoading(false);
    if (result.kind === "ok") {
      setEvents(result.data.events);
      setNextCursor(result.data.next_cursor);
      setError(null);
      setLoaded(true);
      return;
    }
    setError(result);
  };

  const handleLoad = () => {
    if (capabilityToken.trim().length === 0 || loading) return;
    void runRead();
  };

  const handleNext = (cursor: string) => {
    if (loading) return;
    void runRead(cursor);
  };

  const handleRestart = () => {
    if (loading) return;
    setError(null);
    void runRead();
  };

  return (
    <section className="sandbox-security-audit-page">
      <Typography.Title level={3}>审计事件</Typography.Title>
      <Typography.Paragraph type="secondary">
        读取内容无关的沙箱安全审计事件。所有字段均不包含提交内容或凭据。
      </Typography.Paragraph>
      <Space orientation="vertical" size="large" style={{ width: "100%" }}>
        <CapabilitySessionPanel
          hasToken={capabilityToken.trim().length > 0}
          requiresNewCapability={requiresNewCapability}
          onTokenChange={setCapabilityToken}
          onClear={() => setCapabilityToken("")}
        />
        <Button
          type="primary"
          onClick={handleLoad}
          disabled={capabilityToken.trim().length === 0 || loading}
          loading={loading}
        >
          加载审计事件
        </Button>
        {failureCopy && !requiresNewCapability ? (
          <Space orientation="vertical" size="small" style={{ width: "100%" }}>
            <Alert
              role="alert"
              type="error"
              showIcon
              title={failureCopy.title}
              description={failureCopy.remedy}
            />
            <Button size="small" onClick={handleRestart} disabled={loading}>
              重新开始读取
            </Button>
          </Space>
        ) : null}
        {loaded ? (
          <>
            <AuditEventTable events={events} />
            <AuditCursorPager
              nextCursor={nextCursor}
              loading={loading}
              onNext={handleNext}
              onRestart={handleRestart}
            />
          </>
        ) : null}
      </Space>
    </section>
  );
}
