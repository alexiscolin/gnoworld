import { describe, expect, it } from "vitest";
import { makeRoomCap, ROOM_QUESTIONS } from "./roomcap.ts";

// D13985 point 7: 30 questions an hour a room, a sliding hour, bounded in memory.
const T0 = Date.parse("2026-11-11T12:00:00.000Z");
const MINUTE = 60_000;
const fill = (cap: ReturnType<typeof makeRoomCap>, room: string, at = T0) => {
  for (let count = 0; count < ROOM_QUESTIONS; count += 1) expect(cap.take(room, at + count)).toBe(true);
};

describe("a room's cap", () => {
  it("is 30, the 31st refused and counted for nothing", () => {
    const cap = makeRoomCap();
    expect(ROOM_QUESTIONS).toBe(30);
    fill(cap, "#a");
    expect([cap.take("#a", T0 + 100), cap.take("#a", T0 + 100), cap.take("#b", T0)]).toEqual([false, false, true]);
  });

  it("slides: each question leaves an hour after its own time", () => {
    const cap = makeRoomCap();
    fill(cap, "#a");
    expect(cap.take("#a", T0 + 60 * MINUTE - 1)).toBe(false);
    expect(cap.take("#a", T0 + 60 * MINUTE)).toBe(true);
    expect(cap.take("#a", T0 + 60 * MINUTE)).toBe(false);
    expect(cap.take("#a", T0 + 60 * MINUTE + 1)).toBe(true);
  });

  it("gives a slot back, once", () => {
    const cap = makeRoomCap();
    fill(cap, "#a");
    cap.give("#a", T0 + 5);
    cap.give("#a", T0 + 5);
    expect([cap.take("#a", T0 + 100), cap.take("#a", T0 + 100)]).toEqual([true, false]);
  });

  it("holds a number of rooms: the room asked in longest ago is forgotten first", () => {
    const cap = makeRoomCap({ max: 2 });
    fill(cap, "#a");
    cap.take("#b", T0);
    cap.take("#c", T0);
    expect(cap.take("#a", T0 + 100)).toBe(true);
    fill(cap, "#b", T0 + 200);
  });
});
