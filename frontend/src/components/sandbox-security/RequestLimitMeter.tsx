export interface RequestLimitMeterProps {
  usedBytes: number;
  limitBytes: number;
}

export function RequestLimitMeter({ usedBytes, limitBytes }: RequestLimitMeterProps) {
  const overLimit = usedBytes > limitBytes;
  const ratio = limitBytes > 0 ? usedBytes / limitBytes : 0;
  const fillPercent = Math.min(Math.max(ratio * 100, 0), 100);
  const nearLimit = !overLimit && ratio > 0.9;

  return (
    <div
      className="workbench-byte-meter"
      data-over-limit={overLimit ? "true" : "false"}
      role="progressbar"
      aria-label="请求字节用量"
      aria-valuemin={0}
      aria-valuemax={limitBytes}
      aria-valuenow={usedBytes}
      aria-invalid={overLimit ? "true" : "false"}
    >
      <div className="workbench-byte-meter__track" aria-hidden="true">
        <div
          className="workbench-byte-meter__fill"
          style={{ width: `${fillPercent}%` }}
        />
      </div>
      <div className="workbench-byte-meter__copy" data-mono="true">
        <span>{usedBytes} / {limitBytes} B</span>
        {nearLimit ? <span className="workbench-byte-meter__warning">接近上限</span> : null}
      </div>
    </div>
  );
}
