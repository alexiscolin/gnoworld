import type { Line } from "@gnoworld/core";
import { describe, expect, it } from "vitest";
import { unseenAfter, type Unseen } from "./unseen.ts";

const ME = "g1me";
const T = (minute: number) => `2026-10-25T10:${String(minute).padStart(2, "0")}:00.000Z`;
const line = (n: number, account = "g1you"): Line => ({
  id: `m${String(n)}`,
  time: T(n),
  from: account,
  account,
  text: "x",
  kind: "message",
});
const ROOM = [line(0), line(1), line(2)];
const after = (
  lines: readonly Line[],
  read: string | undefined,
  { away = false, prev }: { away?: boolean; prev?: Unseen | undefined } = {},
) => unseenAfter(prev, { lines, read, me: ME, away });
const ids = (unseen: Unseen | undefined) => [...(unseen?.ids ?? [])];

describe("unseenAfter: which lines wait to be seen", () => {
  it("marks, as the room opens, the lines past the place that are not the reader's", () => {
    expect(ids(after([line(0), line(1), line(2, ME), line(3)], T(0)))).toEqual(["m1", "m3"]);
  });

  it("decides nothing while no line or no place is known", () => {
    expect(after([], T(0))).toBeUndefined();
    expect(after(ROOM, undefined)).toBeUndefined();
  });

  it("marks no line that comes while the reader sees the end", () => {
    const prev = after(ROOM, T(2));
    expect(ids(after([...ROOM, line(3)], T(2), { prev }))).toEqual([]);
  });

  it("marks a line that comes while the reader is away, and not their own", () => {
    const prev = after(ROOM, T(2));
    expect(ids(after([...ROOM, line(3), line(4, ME)], T(2), { away: true, prev }))).toEqual(["m3"]);
  });

  it("marks no older line a scroll up brings in", () => {
    const prev = after(ROOM.slice(1), T(2));
    expect(ids(after(ROOM, T(2), { away: true, prev }))).toEqual([]);
  });

  it("drops the mark of a line the place passes, and keeps the others", () => {
    const prev = after(ROOM, T(0));
    expect(ids(after(ROOM, T(1), { prev }))).toEqual(["m2"]);
    expect(ids(after(ROOM, T(2), { prev }))).toEqual([]);
  });

  it("is the same object when nothing changed", () => {
    const prev = after(ROOM, T(0));
    expect(after(ROOM, T(0), { away: true, prev })).toBe(prev);
  });
});
