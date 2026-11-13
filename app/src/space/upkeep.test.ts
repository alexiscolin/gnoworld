import { describe, expect, it } from "vitest";
import { pulse } from "./pulse.ts";
import { Upkeep } from "./upkeep.ts";

function loop(run: (keep: Upkeep) => boolean) {
  const [keep, leaving, queue] = [new Upkeep(), new AbortController(), [] as ((now: number) => void)[]];
  keep.wake = pulse(
    () => run(keep),
    leaving.signal,
    (step) => queue.push(step),
  );
  return { keep, queue, frame: () => queue.shift()?.(0) };
}

describe("Upkeep.touch", () => {
  it("wakes a sleeping loop once, and draws its next frame", () => {
    const l = loop(() => false);
    l.frame();
    expect(l.queue).toHaveLength(0);
    l.keep.touch();
    l.keep.touch();
    expect(l.queue).toHaveLength(1);
    expect(
      l.keep.redraw.check({
        eye: [0, 0, 0, 0, 0, 0, 1],
        shown: [],
        pxK: 1,
        distance: 1,
        seconds: 0,
        pxPerSecond: 0,
        moving: false,
      }),
    ).toBe("full");
  });

  it("is a no-op for the loop while it is awake, even when a frame touches it (no recursion)", () => {
    let touched = 0;
    const l = loop((keep) => {
      touched += 1;
      keep.touch();
      return true;
    });
    l.frame();
    expect(touched).toBe(1);
    expect(l.queue).toHaveLength(1);
  });
});
