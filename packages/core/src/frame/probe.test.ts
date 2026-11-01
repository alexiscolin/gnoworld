import { describe, expect, it } from "vitest";
import { judgeFrames, PROBE_FRAMES } from "./probe.ts";

const steady = (ms: number, count: number) => new Float64Array(count).fill(ms);

function mixed(...runs: readonly (readonly [ms: number, count: number])[]): Float64Array {
  return Float64Array.from(runs.flatMap(([ms, count]) => new Array<number>(count).fill(ms)));
}

describe("judgeFrames", () => {
  it("waits with no frame at all", () => {
    expect(judgeFrames(steady(0, 0), 0)).toBe("pending");
  });

  it("waits until 90 busy frames, or 2 s", () => {
    expect(PROBE_FRAMES).toBe(90);
    expect(judgeFrames(steady(16, 89), 89)).toBe("pending");
    expect(judgeFrames(steady(16, 90), 90)).toBe("keep");
  });

  it("closes at 2 s on a machine that never reaches 90 frames", () => {
    expect(judgeFrames(steady(50, 39), 39)).toBe("pending");
    expect(judgeFrames(steady(50, 40), 40)).toBe("low");
  });

  it("drops to Low above 20 ms a frame, not at 20", () => {
    expect(judgeFrames(steady(20, 90), 90)).toBe("keep");
    expect(judgeFrames(steady(20.1, 90), 90)).toBe("low");
  });

  it("ignores the slowest tenth, a shader's compile among them", () => {
    expect(judgeFrames(mixed([16, 81], [500, 9]), 90)).toBe("keep");
  });

  it("ignores no more than the slowest tenth", () => {
    expect(judgeFrames(mixed([16, 78], [200, 12]), 90)).toBe("low");
  });

  it("reads the frames it is told of, not what lies past them in the buffer", () => {
    const frames = mixed([16, 90], [500, 90]);
    expect(judgeFrames(frames, 90)).toBe("keep");
  });

  it("reads a steady 33 ms as the browser's battery saver: Low, not remembered", () => {
    expect(judgeFrames(steady(33.3, 61), 61)).toBe("low-for-now");
    expect(judgeFrames(mixed([30.4, 31], [36.2, 31]), 62)).toBe("low-for-now");
  });

  it("reads the steady 33 ms past the slowest tenth", () => {
    expect(judgeFrames(mixed([33.3, 54], [200, 6]), 60)).toBe("low-for-now");
  });

  it("does not read a mean of 33 ms that wobbles as the battery saver: every frame within 3 ms of 33.3", () => {
    expect(judgeFrames(mixed([20, 31], [46, 31]), 62)).toBe("low");
    expect(judgeFrames(mixed([30.2, 31], [36, 31]), 62)).toBe("low");
    expect(judgeFrames(mixed([31, 31], [36.4, 31]), 62)).toBe("low");
  });

  it("does not read a steady 40 ms as the battery saver", () => {
    expect(judgeFrames(steady(40, 50), 50)).toBe("low");
  });
});
