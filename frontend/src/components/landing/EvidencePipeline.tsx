import { evidencePipeline } from "../../content/landing-content";

export function EvidencePipeline() {
  return (
    <section
      id="architecture"
      className="landing-section landing-architecture"
      aria-label="Architecture evidence pipeline"
    >
      <div className="landing-architecture__intro">
        <p className="landing-eyebrow" lang="en">FROM SIGNAL TO DECISION</p>
        <h2 id="architecture-title" lang="en">A defensible security decision has a chain of evidence.</h2>
        <p>
          将发现、归一化、分析、决策、执行与审计串成可追溯的证据链，
          让每个策略结果都能说明其来源与依据。
        </p>
      </div>

      <ol className="landing-architecture__pipeline">
        {evidencePipeline.map((stage, index) => (
          <li className="landing-architecture__stage" key={stage.id}>
            <span className="landing-architecture__stage-index">0{index + 1}</span>
            <h3 lang="en">{stage.labelEn}</h3>
            <code>{stage.identifier}</code>
            <p lang="zh-CN">{stage.descriptionZh}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
