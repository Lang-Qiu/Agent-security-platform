export function EnvironmentLayer({ className = "" }: { readonly className?: string }) {
  return (
    <div className={`landing-environment ${className}`.trim()} aria-hidden="true">
      <span className="landing-environment__grid" />
    </div>
  );
}
