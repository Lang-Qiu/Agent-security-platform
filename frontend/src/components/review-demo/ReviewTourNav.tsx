// Five-minute review tour navigation: an Ant Design Steps rail plus
// prev/next controls. Pure presentational — no fetch, no side effects.

import { Button, Space, Steps } from "antd";

import type { ReviewTourStep } from "../../content/review-demo-content";

export interface ReviewTourNavProps {
  steps: ReviewTourStep[];
  activeStepId: string;
  onSelect: (stepId: string) => void;
}

export function ReviewTourNav({
  steps,
  activeStepId,
  onSelect
}: ReviewTourNavProps) {
  const ordered = [...steps].sort((a, b) => a.order - b.order);
  const activeIndex = ordered.findIndex((step) => step.id === activeStepId);
  const currentIndex = activeIndex === -1 ? 0 : activeIndex;

  const goTo = (index: number) => {
    if (index < 0 || index >= ordered.length) return;
    onSelect(ordered[index].id);
  };

  return (
    <nav aria-label="评审导览步骤" className="review-demo-tour-nav">
      <Steps
        orientation="vertical"
        size="small"
        current={currentIndex}
        onChange={(index) => goTo(index)}
        items={ordered.map((step) => ({
          title: step.title
        }))}
      />
      <Space className="review-demo-tour-nav__controls">
        <Button
          disabled={currentIndex <= 0}
          onClick={() => goTo(currentIndex - 1)}
        >
          上一步
        </Button>
        <Button
          type="primary"
          disabled={currentIndex >= ordered.length - 1}
          onClick={() => goTo(currentIndex + 1)}
        >
          下一步
        </Button>
      </Space>
    </nav>
  );
}
