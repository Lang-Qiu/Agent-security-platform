import { Alert, Button, Input, Space, Typography } from "antd";

const { Text } = Typography;

const TOKEN_FIELD_ID = "sandbox-security-capability-token";

export interface CapabilitySessionPanelProps {
  /** Whether a capability token is currently held in memory by the page. */
  hasToken: boolean;
  /** Set when the backend answered 401/403 and the held token is unusable. */
  requiresNewCapability?: boolean;
  /** Reports the transient input value upward; the panel keeps no copy. */
  onTokenChange: (token: string) => void;
  /** Drops the in-memory token held by the page. */
  onClear: () => void;
}

/**
 * Memory-only capability entry. The panel is controlled: it receives
 * `hasToken` (a boolean), never the token itself, so the token can never be
 * re-rendered into the DOM. The input value is transient and reported upward
 * through `onTokenChange`; the panel writes nothing to localStorage or
 * sessionStorage. The capability is opaque, so no expiry countdown is shown —
 * expiry surfaces only when the backend answers 401/403
 * (`requiresNewCapability`).
 */
export function CapabilitySessionPanel({
  hasToken,
  requiresNewCapability = false,
  onTokenChange,
  onClear
}: CapabilitySessionPanelProps) {
  return (
    <section className="console-panel" aria-label="令牌会话">
      <Space orientation="vertical" size="small" style={{ width: "100%" }}>
        <label htmlFor={TOKEN_FIELD_ID}>能力令牌</label>
        <Input
          id={TOKEN_FIELD_ID}
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="粘贴能力令牌"
          onChange={(event) => onTokenChange(event.target.value)}
        />
        <Text type="secondary">
          令牌仅保存在内存中，刷新或关闭页面即丢失，绝不写入任何存储或日志。
        </Text>
        {hasToken ? (
          <Text type="secondary">当前会话已持有一个能力令牌。</Text>
        ) : null}
        {requiresNewCapability ? (
          <Alert
            role="alert"
            type="warning"
            showIcon
            title="后端已拒绝当前令牌，请粘贴一个新的能力令牌。"
          />
        ) : null}
        <Button onClick={onClear} disabled={!hasToken}>
          清除令牌
        </Button>
      </Space>
    </section>
  );
}
