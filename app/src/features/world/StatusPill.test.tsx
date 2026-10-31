// @vitest-environment jsdom
import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ringOf } from "./statusRing.ts";
import { StatusPill } from "./StatusPill.tsx";

// Slice 5k (ADR-0002 §4, "Status ring"; frames 22 and 27, the pill "Proposal 15 · YES 33% of 66.66%"): the data the orbit will draw
// (slice 7) and the pill that carries the numbers, so the state never rests on the ring alone. The ring shows only what a realm
// reports: no tally, no ring (gnoworld invents no timer). The proposals here are invented for the tests (nothing recorded).
let host: HTMLElement | undefined;
afterEach(() => {
  host?.remove();
  host = undefined;
});
function draw(proposal: { id: number; yes?: number; threshold?: number; title?: string }) {
  host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(<StatusPill proposal={proposal} />);
  });
  return host;
}

describe("the status pill", () => {
  it("reads as the frames do: the proposal, the yes share, the threshold", () => {
    expect(draw({ id: 15, yes: 33, threshold: 66.66 }).textContent).toBe("Proposal 15 · YES 33% of 66.66%");
  });

  it.each([
    [33.4, 50, "Proposal 7 · YES 33% of 50%"],
    [33.5, 50, "Proposal 7 · YES 34% of 50%"],
    [33.6, 50, "Proposal 7 · YES 34% of 50%"],
    [99.5, 50, "Proposal 7 · YES 100% of 50%"],
    [0.4, 50, "Proposal 7 · YES 0% of 50%"],
    [0, 66.666, "Proposal 7 · YES 0% of 66.67%"],
    [0, 66.66, "Proposal 7 · YES 0% of 66.66%"],
    [0, 66.125, "Proposal 7 · YES 0% of 66.13%"],
    [0, 12.375, "Proposal 7 · YES 0% of 12.38%"],
  ])(
    "rounds yes %s (to a whole percent, half up) and threshold %s (to two decimals, no trailing zero): %s",
    (yes, threshold, words) => {
      expect(draw({ id: 7, yes, threshold }).textContent).toBe(words);
    },
  );

  it("says nothing for a proposal number that is no whole number of 0 or more", () => {
    for (const id of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(draw({ id, yes: 33, threshold: 66.66 }).textContent).toBe("");
    }
    expect(draw({ id: 0 }).textContent).toBe("Proposal 0");
  });

  it("says the proposal and nothing else when the realm gave no tally: never a number it did not give", () => {
    expect(draw({ id: 15 }).textContent).toBe("Proposal 15");
    expect(draw({ id: 15, threshold: 66.66 }).textContent).toBe("Proposal 15");
    expect(draw({ id: 15, yes: 33 }).textContent).toBe("Proposal 15");
  });

  it("draws a tally outside 0 to 100, or that is no number, as no tally", () => {
    for (const yes of [-1, 101, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(draw({ id: 15, yes, threshold: 66.66 }).textContent).toBe("Proposal 15");
    }
  });

  it("is a status the screen reader says, not a button", () => {
    const el = draw({ id: 15, yes: 33, threshold: 66.66 });
    expect(el.querySelector("[role='status']")).not.toBeNull();
    expect(el.querySelector("button, a")).toBeNull();
  });
});

describe("the ring's data", () => {
  it("gives the lit share and the threshold's mark, each as a fraction of the orbit", () => {
    const ring = (yes: number, threshold: number) => ringOf({ id: 15, yes, threshold });
    expect(ring(33, 66.66)?.lit).toBeCloseTo(0.33, 10);
    expect(ring(33, 66.66)?.mark).toBeCloseTo(0.6666, 10);
    expect(ring(33.4, 66.666)?.lit).toBeCloseTo(0.334, 10);
    expect(ring(33.4, 66.666)?.mark).toBeCloseTo(0.66666, 10);
    expect(ring(0, 50)).toEqual({ lit: 0, mark: 0.5 });
    expect(ring(100, 100)).toEqual({ lit: 1, mark: 1 });
  });

  it("gives no ring when the realm gave no tally or no threshold", () => {
    expect(ringOf({ id: 15 })).toBeUndefined();
    expect(ringOf({ id: 15, yes: 33 })).toBeUndefined();
    expect(ringOf({ id: 15, threshold: 50 })).toBeUndefined();
  });

  it("gives no ring for a share outside 0 to 100 or that is no number", () => {
    for (const bad of [-1, 100.01, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(ringOf({ id: 15, yes: bad, threshold: 50 })).toBeUndefined();
      expect(ringOf({ id: 15, yes: 50, threshold: bad })).toBeUndefined();
    }
  });
});
