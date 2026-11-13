import { expect, it, vi } from "vitest";
import { motionOf } from "./motion.ts";

it("asks the browser for the reduced-motion query once, however many frames read it", () => {
  const ask = vi.fn(() => ({ matches: false, addEventListener: () => undefined }));
  vi.stubGlobal("matchMedia", ask);
  try {
    for (let frame = 0; frame < 5; frame++) expect(typeof motionOf().matches).toBe("boolean");
    expect(ask).toHaveBeenCalledTimes(1);
  } finally {
    vi.unstubAllGlobals();
  }
});
