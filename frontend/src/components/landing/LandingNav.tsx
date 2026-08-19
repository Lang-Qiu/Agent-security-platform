import { CloseOutlined, MenuOutlined, SafetyOutlined } from "@ant-design/icons";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";

import { landingNavigation } from "../../content/landing-content";

function getDialogControls(dialog: HTMLElement): HTMLElement[] {
  return Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
    )
  );
}

export function LandingNav() {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const closeDialog = () => {
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") closeDialog();
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    closeRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  const trapFocus = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab") return;

    const controls = getDialogControls(event.currentTarget);
    const first = controls[0];
    const last = controls.at(-1);
    if (!first || !last) return;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <nav className="landing-nav" aria-label="Product navigation">
      <a className="landing-nav__brand" href="#top" aria-label="Agent Security Platform home">
        <SafetyOutlined aria-hidden="true" />
        <span>Agent Security Platform</span>
      </a>

      <div className="landing-nav__desktop-links">
        {landingNavigation.map((item) => (
          <a key={item.href} href={item.href}>
            {item.label}
          </a>
        ))}
      </div>

      <Link className="landing-nav__console-link" to="/console">
        Launch Security Console
      </Link>
      <button
        ref={triggerRef}
        className="landing-nav__menu-button"
        type="button"
        aria-label="Open navigation"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(true)}
      >
        <MenuOutlined aria-hidden="true" />
      </button>

      {isOpen ? (
        <div
          className="landing-nav__dialog"
          role="dialog"
          aria-modal="true"
          aria-label="Landing navigation"
          onKeyDown={trapFocus}
        >
          <button
            ref={closeRef}
            className="landing-nav__dialog-close"
            type="button"
            aria-label="Close navigation"
            onClick={closeDialog}
          >
            <CloseOutlined aria-hidden="true" />
          </button>
          {landingNavigation.map((item) => (
            <a key={item.href} href={item.href} onClick={closeDialog}>
              {item.label}
            </a>
          ))}
          <Link to="/console" onClick={closeDialog}>
            Launch Security Console
          </Link>
        </div>
      ) : null}
    </nav>
  );
}
