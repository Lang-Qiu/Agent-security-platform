import { Button, Input, Select } from "antd";
import { motion } from "motion/react";

import {
  SANDBOX_SECURITY_CLAIMED_SOURCE_TYPES,
  type SandboxSecuritySubmittedContentItem
} from "../../../../shared/types/sandbox-security";
import { measureUtf8Bytes } from "../../utils/sandbox-security-limits";
import { CALM_SPRING, REDUCED_TRANSITION } from "./showcase/showcase-motion";

const MEDIA_TYPES = ["text/plain", "application/json"] as const;

function hasOnlyFiniteJsonNumbers(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(hasOnlyFiniteJsonNumbers);
  if (value !== null && typeof value === "object") {
    return Object.values(value).every(hasOnlyFiniteJsonNumbers);
  }
  return true;
}

export function parseEditedValue(
  rawValue: string,
  mediaType: SandboxSecuritySubmittedContentItem["media_type"]
): SandboxSecuritySubmittedContentItem["value"] {
  if (mediaType === "text/plain") return rawValue;
  try {
    const parsed: unknown = JSON.parse(rawValue);
    return hasOnlyFiniteJsonNumbers(parsed)
      ? (parsed as SandboxSecuritySubmittedContentItem["value"])
      : rawValue;
  } catch {
    return rawValue;
  }
}

export interface ContentItemRowProps {
  index: number;
  item: SandboxSecuritySubmittedContentItem;
  canRemove: boolean;
  reduceMotion: boolean;
  onChange: (item: SandboxSecuritySubmittedContentItem) => void;
  onRemove: () => void;
}

export function ContentItemRow({
  index,
  item,
  canRemove,
  reduceMotion,
  onChange,
  onRemove
}: ContentItemRowProps) {
  const valueFieldId = `sandbox-security-content-value-${index}`;
  const displayValue =
    typeof item.value === "string" ? item.value : JSON.stringify(item.value, null, 2);
  const valueForByteMeasurement =
    item.media_type === "application/json"
      ? JSON.stringify(item.value)
      : typeof item.value === "string"
        ? item.value
        : JSON.stringify(item.value);
  const usedBytes = measureUtf8Bytes(valueForByteMeasurement);

  return (
    <motion.section
      className="workbench-source-card"
      aria-label={`来源 ${item.source_id}`}
      data-enter-motion={reduceMotion ? "instant" : "spring"}
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduceMotion ? REDUCED_TRANSITION : CALM_SPRING}
    >
      <header className="workbench-source-card__header">
        <span className="workbench-source-card__id" data-mono="true">
          {item.source_id}
        </span>
        <Select
          aria-label={`来源类型 ${item.source_id}`}
          value={item.claimed_source_type}
          onChange={(claimed_source_type) =>
            onChange({ ...item, claimed_source_type })
          }
          options={SANDBOX_SECURITY_CLAIMED_SOURCE_TYPES.map((type) => ({
            value: type,
            label: type
          }))}
        />
        <Select
          aria-label={`媒体类型 ${item.source_id}`}
          value={item.media_type}
          onChange={(media_type) =>
            onChange({
              ...item,
              media_type,
              value: parseEditedValue(displayValue, media_type)
            })
          }
          options={MEDIA_TYPES.map((type) => ({ value: type, label: type }))}
        />
        <span className="workbench-source-card__size" data-mono="true">
          {usedBytes} B
        </span>
        {canRemove ? (
          <Button
            type="text"
            size="small"
            aria-label={`移除来源 ${item.source_id}`}
            onClick={onRemove}
          >
            ×
          </Button>
        ) : null}
      </header>
      <Input.TextArea
        id={valueFieldId}
        className="workbench-source-card__value"
        aria-label={`内容值 ${item.source_id}`}
        rows={1}
        value={displayValue}
        onChange={(event) =>
          onChange({
            ...item,
            value: parseEditedValue(event.target.value, item.media_type)
          })
        }
      />
    </motion.section>
  );
}
