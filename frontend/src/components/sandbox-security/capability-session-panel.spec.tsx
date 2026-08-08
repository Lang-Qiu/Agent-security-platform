import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CapabilitySessionPanel } from "./CapabilitySessionPanel";

describe("REQ-SBX-GENERAL-005 capability session panel", () => {
  it("uses a password-type field so the token is not shoulder-readable", () => {
    render(<CapabilitySessionPanel hasToken={false} onTokenChange={vi.fn()} onClear={vi.fn()} />);
    const field = screen.getByLabelText(/能力令牌/);
    expect(field).toHaveAttribute("type", "password");
  });

  it("never writes the token to localStorage or sessionStorage", async () => {
    const localSet = vi.spyOn(window.localStorage, "setItem");
    const sessionSet = vi.spyOn(window.sessionStorage, "setItem");
    const onTokenChange = vi.fn();

    render(<CapabilitySessionPanel hasToken={false} onTokenChange={onTokenChange} onClear={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/能力令牌/), { target: { value: "tok-secret" } });

    expect(onTokenChange).toHaveBeenCalled();
    expect(localSet).not.toHaveBeenCalled();
    expect(sessionSet).not.toHaveBeenCalled();
    localSet.mockRestore();
    sessionSet.mockRestore();
  });

  it("disables autocomplete and spellcheck on the token field", () => {
    render(<CapabilitySessionPanel hasToken={false} onTokenChange={vi.fn()} onClear={vi.fn()} />);
    const field = screen.getByLabelText(/能力令牌/);
    expect(field).toHaveAttribute("autocomplete", "off");
    expect(field).toHaveAttribute("spellcheck", "false");
  });

  it("never renders the token value back into the document once held", () => {
    render(<CapabilitySessionPanel hasToken onTokenChange={vi.fn()} onClear={vi.fn()} />);
    expect(document.body.textContent).not.toContain("tok-secret");
  });

  it("offers a clear action that drops the in-memory token", async () => {
    const onClear = vi.fn();
    render(<CapabilitySessionPanel hasToken onTokenChange={vi.fn()} onClear={onClear} />);
    fireEvent.click(screen.getByRole("button", { name: /清除/ }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("states that the token is memory-only and lost on reload", () => {
    render(<CapabilitySessionPanel hasToken={false} onTokenChange={vi.fn()} onClear={vi.fn()} />);
    expect(screen.getByText(/仅保存在内存/)).toBeInTheDocument();
  });

  it("prompts for a fresh token when the backend reported it unusable", () => {
    render(
      <CapabilitySessionPanel
        hasToken
        requiresNewCapability
        onTokenChange={vi.fn()}
        onClear={vi.fn()}
      />
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
