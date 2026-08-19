export function LandingFooter() {
  return (
    <footer className="landing-footer">
      <div className="landing-footer__descriptor">
        <span className="landing-eyebrow" lang="en">AGENT SECURITY PLATFORM</span>
        <p>为 Agent、Skills 与 Tool Interactions 建立可追溯的安全证据链。</p>
      </div>
      <nav className="landing-footer__links" aria-label="Footer navigation">
        <a href="#architecture">Architecture</a>
        <a href="#runtime">Runtime</a>
        <a href="/console">Console</a>
      </nav>
      <p className="landing-footer__meta">
        <code>discover / analyze / contain</code>
        <span>© Agent Security Platform</span>
      </p>
    </footer>
  );
}
