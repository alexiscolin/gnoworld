import { DIVE } from "@gnoworld/core";
import { Scene as Stage } from "three";
import { describe, expect, it, vi } from "vitest";
import { Dive } from "./dive.ts";

// The dive under reduced motion borrows its dissolve from the flights' chunk (7g): one the chunk has not lent, late or failed, leaves the
// eye standing at rest at once rather than holding the dive.
describe("the dive's dissolve, lent", () => {
  it("lands at once, nothing laid over the stage, when no dissolve is lent", () => {
    const stage = new Stage();
    const dive = new Dive({ stage }, true);
    dive.advance(0, true);
    dive.advance(DIVE.hold + 0.1, true);
    expect(dive.along).toBe(1);
    expect(dive.veil).toBe(0);
    expect(stage.children).toHaveLength(0);
  });

  it("asks the lent dissolve for its stage once the hold is over", () => {
    const stage = new Stage();
    const veil = vi.fn(() => ({ copied: false, veil: 0, fade: vi.fn(), dispose: vi.fn() }));
    const dive = new Dive({ stage, veil } as never, true);
    dive.advance(0, true);
    dive.advance(DIVE.hold / 2, true);
    expect(veil).not.toHaveBeenCalled();
    dive.advance(DIVE.hold + 0.1, true);
    expect(veil).toHaveBeenCalledWith(stage);
    expect(dive.along).toBe(0);
  });
});
