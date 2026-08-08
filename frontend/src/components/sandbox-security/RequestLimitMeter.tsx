import { consolePalette } from "../../styles/console-theme";

export interface RequestLimitMeterProps {
  usedBytes: number;
  limitBytes: number;
}

/**
 * Accessible usage meter for the request byte budget. It reports the used and
 * maximum byte counts through ARIA without ever echoing submitted content — it
 * receives only two numbers. An over-limit state is marked with
 * `aria-invalid="true"` so it is conveyed by more than colour alone.
 */
export function RequestLimitMeter({ usedBytes, limitBytes }: RequestLimitMeterProps) {
  const overLimit = usedBytes > limitBytes;
  const ratio = limitBytes > 0 ? Math.min(usedBytes / limitBytes, 1) : 0;
  return (
    <div
      role="progressbar"
      aria-label="请求字节用量"
      aria-valuemin={0}
      aria-valuemax={limitBytes}
      aria-valuenow={usedBytes}
      aria-invalid={overLimit ? "true" : "false"}
    >
      <div
        style={{
          height: 6,
          borderRadius: 3,
          background: "var(--console-surface-raised)"
        }}
      >
        <div
          style={{
            width: `${ratio * 100}%`,
            height: "100%",
            borderRadius: 3,
            background: overLimit
              ? consolePalette.severityCritical
              : consolePalette.accent
          }}
        />
      </div>
      <span style={{ fontFamily: "var(--console-mono)", fontSize: "0.75rem" }}>
        {usedBytes} / {limitBytes}
      </span>
    </div>
  );
}
