export function EvidenceTrace({ className = "" }: { readonly className?: string }) {
  return (
    <span
      className={`landing-evidence-trace ${className}`.trim()}
      aria-hidden="true"
    />
  );
}
