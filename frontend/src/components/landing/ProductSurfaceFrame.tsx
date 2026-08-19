import type { ReactNode } from "react";

export function ProductSurfaceFrame({
  label,
  chrome,
  children
}: {
  readonly label: string;
  readonly chrome?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <figure className="landing-product-surface" aria-label={label}>
      {chrome ? <figcaption className="landing-product-surface__chrome">{chrome}</figcaption> : null}
      <div className="landing-product-surface__body">{children}</div>
    </figure>
  );
}
