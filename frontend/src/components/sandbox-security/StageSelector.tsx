import { Radio } from "antd";

import {
  SANDBOX_SECURITY_STAGES,
  type SandboxSecurityStage
} from "../../../../shared/types/sandbox-security";

const STAGE_DESCRIPTION: Record<SandboxSecurityStage, string> = {
  user_input: "评估用户输入内容，检测注入与越权意图",
  tool_request: "评估工具调用请求，检测参数劫持与作用域滥用",
  model_output: "评估模型输出内容，检测敏感数据泄露与输出操纵"
};

export interface StageSelectorProps {
  stage: SandboxSecurityStage;
  onStageChange: (stage: SandboxSecurityStage) => void;
}

export function StageSelector({ stage, onStageChange }: StageSelectorProps) {
  const descriptionId = "sandbox-security-stage-description";

  return (
    <fieldset aria-describedby={descriptionId}>
      <legend className="sandbox-security-legend">阶段</legend>
      <div className="workbench-stage-tabs">
        {SANDBOX_SECURITY_STAGES.map((option) => (
          <Radio
            key={option}
            className={
              stage === option
                ? "workbench-stage-tab workbench-stage-tab--selected"
                : "workbench-stage-tab"
            }
            name="sandbox-security-stage"
            value={option}
            checked={stage === option}
            onChange={() => onStageChange(option)}
          >
            <span data-mono="true">{option}</span>
          </Radio>
        ))}
      </div>
      <p id={descriptionId} className="workbench-stage-desc">
        {STAGE_DESCRIPTION[stage]}
      </p>
    </fieldset>
  );
}
