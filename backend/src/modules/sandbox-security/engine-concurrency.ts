import type { SandboxSecurityEngineConcurrencyLimiter } from "./sandbox-security.types.ts";

export function createSandboxSecurityEngineConcurrencyLimiter(
  capacity: 4
): SandboxSecurityEngineConcurrencyLimiter {
  if (capacity !== 4) {
    throw new RangeError("Engine concurrency capacity must be four");
  }

  let active = 0;

  return {
    tryAcquire(): (() => void) | null {
      if (active >= capacity) return null;
      active += 1;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        active -= 1;
      };
    },
    activeCount(): number {
      return active;
    }
  };
}
