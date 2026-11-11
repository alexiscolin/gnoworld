import { describe, expect, it } from "vitest";
import { clipOf, fadeFrames, growClips, growFrames, insetClip, parseInset, shrinkFrames } from "./moveClip.ts";

const box = { left: 0, top: 96, right: 1440, bottom: 900 };
const dock = { left: 1080, top: 120, right: 1416, bottom: 880 };
const radii = (clip: string) => clip.split(" round ")[1];

describe("the chat's clips", () => {
  it("shows `within` alone: the insets from each edge of the box", () => {
    expect(clipOf(box, dock, 16)).toBe("inset(24px 24px 20px 1080px round 16px)");
  });

  it("grows between equal radii, which the browser composites, and ends a radius past the box where the corners are out of sight", () => {
    const [start, end] = growClips(box, dock, 16);
    expect(start).toBe(clipOf(box, dock, 16));
    expect(end).toBe("inset(-16px -16px -16px -16px round 16px)");
    expect(radii(end)).toBe(radii(start));
  });
});

describe("the grow's frames", () => {
  const frames = growFrames(box, dock, { round: 16, curve: (t) => t * t, grow: 0.9, tail: 0.06 });

  it("keep the edge on the curve to the end: the box's own edge at the curve's own time, then the tail past it", () => {
    expect(frames[0]).toEqual({ offset: 0, clipPath: clipOf(box, dock, 16) });
    const landed = frames.find((frame) => frame.clipPath === clipOf(box, box, 16));
    expect(landed?.offset).toBeCloseTo(0.9 / 0.96, 5);
    expect(frames.at(-1)).toEqual({ offset: 1, clipPath: growClips(box, dock, 16)[1] });
  });

  it("go forward in time and hold one radius, which keeps the clip composited", () => {
    frames.slice(1).forEach((frame, i) => {
      expect(frame.offset).toBeGreaterThan(frames[i]?.offset ?? 0);
    });
    expect(new Set(frames.map((frame) => frame.clipPath.split(" round ")[1])).size).toBe(1);
  });
});

describe("the clips as keyframes the browser runs on a plain linear timing", () => {
  const curve = (t: number) => t * t;

  it("reads a computed inset() back, and none as no clip", () => {
    expect(parseInset("inset(10px 20.5px 30px -40px round 16px)")).toEqual({
      top: 10,
      right: 20.5,
      bottom: 30,
      left: -40,
    });
    expect(parseInset("none")).toBeUndefined();
  });

  it("reads the shortest form Chromium writes a computed inset() in, its sides filled as a margin's", () => {
    expect(parseInset("inset(10px 0px 30px round 16px)")).toEqual({ top: 10, right: 0, bottom: 30, left: 0 });
    expect(parseInset("inset(10px 0px round 16px)")).toEqual({ top: 10, right: 0, bottom: 10, left: 0 });
    expect(parseInset("inset(-16px round 16px)")).toEqual({ top: -16, right: -16, bottom: -16, left: -16 });
    expect(parseInset("inset(5px)")).toEqual({ top: 5, right: 5, bottom: 5, left: 5 });
    expect(parseInset("inset(1px 2px 3px 4px 5px)")).toBeUndefined();
    expect(parseInset("inset(10% round 16px)")).toBeUndefined();
  });

  it("shrinks from any inset to the dock's, on the curve, one radius", () => {
    const start = { top: 10, right: 20, bottom: 30, left: 40 };
    const to = { top: 24, right: 24, bottom: 20, left: 1080 };
    const frames = shrinkFrames(start, to, { round: 16, curve });
    expect(frames[0]).toEqual({ offset: 0, clipPath: insetClip(start, 16) });
    expect(frames.at(-1)).toEqual({ offset: 1, clipPath: insetClip(to, 16) });
    const mid = frames[Math.floor(frames.length / 2)];
    expect(mid?.clipPath).toBe(
      insetClip({ top: 10 + 14 * 0.25, right: 20 + 4 * 0.25, bottom: 30 - 10 * 0.25, left: 40 + 1040 * 0.25 }, 16),
    );
  });

  it("fades from a value to another on the curve", () => {
    const frames = fadeFrames(curve, 0.5, 0);
    expect(frames[0]).toEqual({ offset: 0, opacity: 0.5 });
    expect(frames.at(-1)).toEqual({ offset: 1, opacity: 0 });
    frames.slice(1).forEach((frame, i) => {
      expect(frame.offset).toBeGreaterThan(frames[i]?.offset ?? 0);
      expect(frame.opacity).toBeLessThanOrEqual(frames[i]?.opacity ?? 0);
    });
  });
});
