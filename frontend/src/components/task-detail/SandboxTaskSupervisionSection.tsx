import { Typography } from "antd";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import type { SandboxRunResultDetails } from "../../../../../shared/types/result";
import type { SandboxSupervisionSessionDetail } from "../../../shared/types/supervision";
import { loadTaskSupervisionDetail } from "../../services/supervision-service";
import { SandboxAlertSection } from "./SandboxAlertSection";

const { Paragraph, Title } = Typography;

function extractSessionId(
  details: SandboxRunResultDetails | undefined | null
): string | null {
  if (!details) {
    return null;
  }
  if (
    typeof details.session_id !== "string" ||
    details.session_id.length === 0
  ) {
    return null;
  }
  return details.session_id;
}

export function SandboxTaskSupervisionSection({
  details
}: {
  details: SandboxRunResultDetails | undefined | null;
}) {
  const sessionId = extractSessionId(details);
  const [supervision, setSupervision] =
    useState<SandboxSupervisionSessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      setUnavailable(false);
      setSupervision(null);
      return;
    }

    let isActive = true;
    const controller = new AbortController();

    void loadTaskSupervisionDetail(sessionId, {
      signal: controller.signal
    }).then((nextDetail) => {
      if (!isActive) {
        return;
      }
      if (nextDetail) {
        setSupervision(nextDetail);
        setUnavailable(false);
      } else {
        setSupervision(null);
        setUnavailable(true);
      }
      setLoading(false);
    });

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [sessionId]);

  if (loading) {
    return null;
  }

  if (!sessionId) {
    return <SandboxAlertSection supervision={null} />;
  }

  return (
    <section className="console-panel sandbox-task-supervision">
      <Title level={2}>Supervision summary</Title>
      {unavailable ? (
        <Paragraph className="task-detail-copy">
          Supervision detail is unavailable
        </Paragraph>
      ) : (
        <SandboxAlertSection supervision={supervision} />
      )}
      <div className="supervision-deep-link">
        <Link
          to={`/results/sandbox?session_id=${encodeURIComponent(sessionId)}`}
        >
          Investigate in supervision console
        </Link>
      </div>
    </section>
  );
}
