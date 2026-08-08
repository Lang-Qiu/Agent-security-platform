import { Button, Space } from "antd";

export interface AuditCursorPagerProps {
  /** Opaque forward cursor, or null when there is no next page. */
  nextCursor: string | null;
  loading: boolean;
  /** Emits the opaque cursor upward; the page owns the fetch. */
  onNext: (cursor: string) => void;
  /** Restarts paging from the first page. */
  onRestart: () => void;
}

/**
 * Cursor-based pager. The cursor is opaque and is emitted upward through
 * `onNext`; it is never placed in the URL, storage, or a log. "Next" is
 * disabled when no forward cursor exists.
 */
export function AuditCursorPager({
  nextCursor,
  loading,
  onNext,
  onRestart
}: AuditCursorPagerProps) {
  return (
    <Space size="small">
      <Button onClick={onRestart} disabled={loading}>
        重新开始
      </Button>
      <Button
        type="primary"
        loading={loading}
        disabled={nextCursor === null}
        onClick={() => {
          if (nextCursor !== null) {
            onNext(nextCursor);
          }
        }}
      >
        下一页
      </Button>
    </Space>
  );
}
