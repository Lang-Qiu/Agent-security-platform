import { useState } from "react";
import { Alert, Button, Input, Typography } from "antd";

const { Text } = Typography;
const TOKEN_FIELD_ID = "sandbox-security-capability-token";

export interface CapabilitySessionPanelProps {
  hasToken: boolean;
  requiresNewCapability?: boolean;
  onTokenChange: (token: string) => void;
  onClear: () => void;
}

export function CapabilitySessionPanel({
  hasToken,
  requiresNewCapability = false,
  onTokenChange,
  onClear
}: CapabilitySessionPanelProps) {
  const [editing, setEditing] = useState(!hasToken);
  const held = hasToken && !requiresNewCapability && !editing;

  return (
    <section
      className={
        held
          ? "console-panel workbench-credential-panel workbench-credential-panel--held"
          : "console-panel workbench-credential-panel"
      }
      aria-label="令牌会话"
    >
      <div className="workbench-credential-panel__heading">
        <span className="workbench-section-eyebrow">SECURITY CREDENTIAL</span>
        {held ? (
          <span className="workbench-credential-status" data-mono="true">
            TOKEN HELD · 令牌已持有
          </span>
        ) : null}
      </div>

      {held ? null : (
        <div className="workbench-credential-panel__entry">
          <label htmlFor={TOKEN_FIELD_ID}>能力令牌</label>
          <Input
            key={requiresNewCapability ? "rejected" : "entry"}
            id={TOKEN_FIELD_ID}
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="粘贴能力令牌"
            onChange={(event) => onTokenChange(event.target.value)}
            onBlur={() => {
              if (hasToken) setEditing(false);
            }}
          />
          <Text type="secondary">
            令牌仅保存在内存中，刷新或关闭页面即丢失，绝不写入任何存储或日志。
          </Text>
        </div>
      )}

      {requiresNewCapability ? (
        <Alert
          role="alert"
          type="warning"
          showIcon
          title="后端已拒绝当前令牌，请粘贴一个新的能力令牌。"
        />
      ) : null}

      <Button
        onClick={() => {
          onClear();
          setEditing(true);
        }}
        disabled={!hasToken}
      >
        清除令牌
      </Button>
    </section>
  );
}
