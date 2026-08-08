import { Button, Input, Select, Space } from "antd";

import {
  SANDBOX_SECURITY_CLAIMED_SOURCE_TYPES,
  type SandboxSecuritySubmittedContentItem
} from "../../../../shared/types/sandbox-security";

const MEDIA_TYPES = ["text/plain", "application/json"] as const;

export interface ContentItemRowProps {
  index: number;
  item: SandboxSecuritySubmittedContentItem;
  canRemove: boolean;
  onChange: (item: SandboxSecuritySubmittedContentItem) => void;
  onRemove: () => void;
}

/**
 * Presentational editor for one submitted content item. The submitted `value`
 * lives only in the textarea's form value — never in a `title`, `aria-label`,
 * `data-*` attribute, URL, or storage. Catalog options come from the shared
 * `SANDBOX_SECURITY_CLAIMED_SOURCE_TYPES` constant; no local enum is declared.
 */
export function ContentItemRow({
  index,
  item,
  canRemove,
  onChange,
  onRemove
}: ContentItemRowProps) {
  const valueFieldId = `sandbox-security-content-value-${index}`;
  const displayValue =
    typeof item.value === "string" ? item.value : JSON.stringify(item.value, null, 2);

  return (
    <Space orientation="vertical" size="small" style={{ width: "100%" }}>
      <label htmlFor={`sandbox-security-content-source-type-${index}`}>来源类型</label>
      <Select
        id={`sandbox-security-content-source-type-${index}`}
        value={item.claimed_source_type}
        style={{ width: "100%" }}
        onChange={(claimed_source_type) => onChange({ ...item, claimed_source_type })}
        options={SANDBOX_SECURITY_CLAIMED_SOURCE_TYPES.map((type) => ({
          value: type,
          label: type
        }))}
      />
      <label htmlFor={`sandbox-security-content-media-type-${index}`}>媒体类型</label>
      <Select
        id={`sandbox-security-content-media-type-${index}`}
        value={item.media_type}
        style={{ width: "100%" }}
        onChange={(media_type) => onChange({ ...item, media_type })}
        options={MEDIA_TYPES.map((type) => ({ value: type, label: type }))}
      />
      <label htmlFor={valueFieldId}>内容值</label>
      <Input.TextArea
        id={valueFieldId}
        rows={3}
        value={displayValue}
        style={{ fontFamily: "var(--console-mono)" }}
        onChange={(event) => onChange({ ...item, value: event.target.value })}
      />
      {canRemove ? (
        <Button size="small" onClick={onRemove}>
          移除来源
        </Button>
      ) : null}
    </Space>
  );
}
