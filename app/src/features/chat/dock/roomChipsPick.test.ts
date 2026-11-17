import { describe, expect, it } from "vitest";
import { chipsFit, pickRooms } from "./roomChipsPick.ts";

const room = (name: string, messages?: number, here?: number) => ({ room: `#w/${name}`, messages, here });

describe("pickRooms", () => {
  const rooms = [room("a", 1), room("b", 9), room("c", 5, 3), room("d", 5, 1), room("e"), room("f", 2)];

  it("puts the room in view first, then the unread (most first), then the most active by lines then people", () => {
    expect(pickRooms(rooms, "#w/e", { "#w/f": 4, "#w/a": 7, "#w/d": 0 })).toEqual([
      "#w/e",
      "#w/a",
      "#w/f",
      "#w/b",
      "#w/c",
      "#w/d",
    ]);
  });

  it("keeps the list's order for rooms that tie, and holds only the first 40", () => {
    const many = Array.from({ length: 60 }, (_, i) => room(`r${String(i)}`));
    const picked = pickRooms(many, undefined, undefined);
    expect(picked).toHaveLength(40);
    expect(picked[0]).toBe("#w/r0");
  });
});

describe("chipsFit", () => {
  // five chips of 50 px, 4 px apart: all five are 266 px.
  const widths = [50, 50, 50, 50, 50];

  it("holds all of them when they fit with no '+N'", () => {
    expect(chipsFit(widths, { room: 266, gap: 4, more: 40 })).toBe(5);
  });

  it("leaves the end to the '+N' chip when they do not", () => {
    // 3 chips = 158, then 4 + 40 for "+N" = 202; 4 chips = 212, +44 = 256.
    expect(chipsFit(widths, { room: 255, gap: 4, more: 40 })).toBe(3);
    expect(chipsFit(widths, { room: 256, gap: 4, more: 40 })).toBe(4);
  });

  it("never drops the room in view", () => {
    expect(chipsFit(widths, { room: 10, gap: 4, more: 40 })).toBe(1);
  });
});
