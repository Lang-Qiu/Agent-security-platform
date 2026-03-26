import "@testing-library/jest-dom/vitest";

import { vi } from "vitest";

if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }));
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = vi.fn();
}

const originalGetComputedStyle = window.getComputedStyle.bind(window);

window.getComputedStyle = ((element: Element, pseudoElt?: string | null) => {
  if (pseudoElt) {
    return originalGetComputedStyle(element);
  }

  return originalGetComputedStyle(element);
}) as typeof window.getComputedStyle;
