import { useState } from "react";

import { productLayers } from "../../content/landing-content";

export function PlatformLayerStack() {
  const [selectedLayer, setSelectedLayer] = useState(productLayers[0].id);
  const selected = productLayers.find((layer) => layer.id === selectedLayer) ?? productLayers[0];
  const [imageError, setImageError] = useState(false);

  return (
    <section
      id="platform"
      className="landing-section landing-platform"
      aria-label="Platform security layers"
    >
      <div className="landing-platform__intro">
        <p className="landing-eyebrow" lang="en">ONE PLATFORM. THREE SECURITY LAYERS.</p>
        <h2 id="platform-title" lang="en">See the whole security posture, not isolated checks.</h2>
        <p>
          在统一的产品视图中关联资产发现、Skill 静态分析与运行时防护，
          让每一层安全能力都回到同一条证据链。
        </p>
      </div>

      <div className="landing-platform__layout">
        <div className="landing-platform__layers" role="tablist" aria-label="Security layers">
          {productLayers.map((layer) => (
            <button
              key={layer.id}
              className="landing-platform__layer"
              type="button"
              aria-pressed={selected.id === layer.id}
              aria-controls={`platform-layer-${layer.id}`}
              onClick={() => setSelectedLayer(layer.id)}
            >
              <span className="landing-platform__layer-index">{layer.index}</span>
              <span className="landing-platform__layer-copy">
                <strong lang="en">{layer.label}</strong>
                <code>{layer.id}</code>
              </span>
              <span className="landing-platform__layer-state" aria-hidden="true">
                {selected.id === layer.id ? "ACTIVE" : "VIEW"}
              </span>
            </button>
          ))}
        </div>

        <div className="landing-platform__proof-column">
          <figure
            className="landing-platform__surface"
            id={`platform-layer-${selected.id}`}
            data-selected-layer={selected.id}
            aria-label="Security Operations Console product proof"
          >
            <figcaption className="landing-platform__surface-chrome">
              <span>SECURITY OPERATIONS CONSOLE</span>
              <code>product_surface / {selected.id}</code>
            </figcaption>
            <div className="landing-platform__surface-body">
              {imageError ? (
                <div className="landing-platform__capture-pending" role="status">
                  <strong>First-party Console capture pending approval</strong>
                  <span>Platform proof remains unavailable until a truthful capture is approved.</span>
                </div>
              ) : null}
              {!imageError ? (
                <img
                  className="landing-platform__image"
                  src="/landing/console-overview-2x.webp"
                  width={2400}
                  height={1500}
                  loading="lazy"
                  decoding="async"
                  alt="Security Operations Console product proof"
                  onError={() => setImageError(true)}
                />
              ) : null}
              <div className={`landing-platform__overlay landing-platform__overlay--${selected.overlay}`}>
                <span className="landing-platform__overlay-rule" aria-hidden="true" />
                <span className="landing-platform__overlay-label" lang="en">{selected.label}</span>
                <code>{selected.id} / evidence_view</code>
              </div>
            </div>
          </figure>
          <p className="landing-platform__selection" id={`platform-selection-${selected.id}`}>
            <span className="landing-metadata" lang="en">SELECTED LAYER</span>
            <span lang="zh-CN">{selected.descriptionZh}</span>
          </p>
        </div>
      </div>
    </section>
  );
}
