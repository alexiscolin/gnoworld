import { Address, type PinList } from "@gnoworld/schemas";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Result } from "../../lib/api/http.ts";
import { PINS_EVERY_MS, pinAsker } from "./askPins.ts";

// The shown room's pins (slice 4's 4d): asked of the server when the room is shown, again each minute while the page
// shows, and after the reader's own pin or unpin. Ergo tells nothing of them (they are the server's, docs/plans/slice-4.md
// §7), so another moderator's change reaches a reader within a minute, or at the next look.
const ALICE = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const list = (room: string, ids: string[], may = false): PinList => ({
  room,
  may,
  pins: ids.map((id) => ({ id, time: "2026-10-25T10:00:00.000Z", account: ALICE, text: id })),
});
const ok = (value: PinList): Result<PinList> => ({ ok: true, value });

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

// A server answering each ask as told (one list a room by default), and what it was asked and what the store was told.
interface Wanted {
  answer?: (room: string, call: "pins" | "pin" | "unpin") => Promise<Result<PinList>>;
  visible?: () => boolean;
}
function setup({ answer = (room) => Promise.resolve(ok(list(room, ["m1"]))), visible = () => true }: Wanted = {}) {
  const asked: string[] = [];
  const told: PinList[] = [];
  // `reader`: who the session is now, which the page tells the asker as it shows the room (the effect after the render).
  const state: { visible: boolean; reader: string | undefined } = { visible: true, reader: undefined };
  const asker = pinAsker({
    reader: () => state.reader,
    pins: (room) => {
      asked.push(`pins ${room}`);
      return answer(room, "pins");
    },
    pin: (room, id) => {
      asked.push(`pin ${room} ${id}`);
      return answer(room, "pin");
    },
    unpin: (room, id) => {
      asked.push(`unpin ${room} ${id}`);
      return answer(room, "unpin");
    },
    set: (next) => told.push(next),
    visible: () => state.visible && visible(),
  });
  const show = (room: string | undefined, reader: string | undefined) => {
    state.reader = reader;
    asker.show(room, reader);
  };
  return { asker: { ...asker, show }, asked, told, state };
}
const settled = () => vi.advanceTimersByTimeAsync(0);

describe("the shown room's pins", () => {
  it("are asked as the room is shown, and handed to the store", async () => {
    const t = setup();
    t.asker.show("#bubble", ALICE);
    await settled();
    expect(t.asked).toEqual(["pins #bubble"]);
    expect(t.told).toEqual([list("#bubble", ["m1"])]);
  });

  // The decision's number, in its own words (docs/decisions.md, 2026-10-27): a minute, not a moment less.
  it("are asked each minute while the page shows, and not before", async () => {
    const t = setup();
    t.asker.show("#bubble", ALICE);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(t.asked).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.asked).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.asked).toHaveLength(3);
    expect(PINS_EVERY_MS).toBe(60_000);
  });

  it("are not asked while the page is hidden, and asked at once by a refresh once it shows", async () => {
    const t = setup();
    t.asker.show("#bubble", ALICE);
    await settled();
    t.state.visible = false;
    await vi.advanceTimersByTimeAsync(3 * PINS_EVERY_MS);
    expect(t.asked).toHaveLength(1);
    t.asker.refresh();
    await settled();
    expect(t.asked).toHaveLength(1);
    t.state.visible = true;
    t.asker.refresh();
    await settled();
    expect(t.asked).toHaveLength(2);
    // The minute's turn comes again from that ask.
    await vi.advanceTimersByTimeAsync(PINS_EVERY_MS);
    expect(t.asked).toHaveLength(3);
  });

  it("move to another room as it is shown, the old one asked no more", async () => {
    const t = setup();
    t.asker.show("#bubble", ALICE);
    await settled();
    t.asker.show("#bubble/games", ALICE);
    await settled();
    await vi.advanceTimersByTimeAsync(PINS_EVERY_MS);
    expect(t.asked).toEqual(["pins #bubble", "pins #bubble/games", "pins #bubble/games"]);
  });

  it("are asked once for the same room shown again as it was, with no second timer", async () => {
    const t = setup();
    t.asker.show("#bubble", ALICE);
    t.asker.show("#bubble", ALICE);
    await settled();
    expect(t.asked).toEqual(["pins #bubble"]);
    await vi.advanceTimersByTimeAsync(PINS_EVERY_MS);
    expect(t.asked).toHaveLength(2);
  });

  it("are asked for no room while none is shown, a direct message's among them", async () => {
    const t = setup();
    t.asker.show(undefined, ALICE);
    await vi.advanceTimersByTimeAsync(2 * PINS_EVERY_MS);
    expect(t.asked).toEqual([]);
  });

  it("are asked one request at a time: a minute's turn that finds the last still waiting asks none", async () => {
    let release: (value: Result<PinList>) => void = () => undefined;
    const t = setup({ answer: () => new Promise((resolve) => (release = resolve)) });
    t.asker.show("#bubble", ALICE);
    await vi.advanceTimersByTimeAsync(3 * PINS_EVERY_MS);
    expect(t.asked).toHaveLength(1);
    release(ok(list("#bubble", ["m1"])));
    await settled();
    await vi.advanceTimersByTimeAsync(PINS_EVERY_MS);
    expect(t.asked).toHaveLength(2);
  });

  it("keep what the store holds when the server fails, and are asked again at the next turn", async () => {
    let fail = true;
    const t = setup({
      answer: (room) => Promise.resolve(fail ? { ok: false, reason: "unavailable" } : ok(list(room, ["m1"]))),
    });
    t.asker.show("#bubble", ALICE);
    await settled();
    expect(t.told).toEqual([]);
    fail = false;
    await vi.advanceTimersByTimeAsync(PINS_EVERY_MS);
    expect(t.told).toEqual([list("#bubble", ["m1"])]);
  });

  it("go on when the call itself throws, asking again at the next turn", async () => {
    let throws = true;
    const t = setup({
      answer: (room) =>
        throws ? Promise.reject(new Error("the call broke")) : Promise.resolve(ok(list(room, ["m1"]))),
    });
    t.asker.show("#bubble", ALICE);
    await settled();
    throws = false;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.told).toEqual([list("#bubble", ["m1"])]);
  });

  // The right to pin is the session's: an answer asked for an account must not reach a store that is now a guest's.
  it("drop an answer that comes after the reader changed, an account's never shown to the guest it logged out as", async () => {
    const releases: ((value: Result<PinList>) => void)[] = [];
    const t = setup({ answer: () => new Promise((resolve) => releases.push(resolve)) });
    t.asker.show("#bubble", ALICE);
    t.asker.show("#bubble", undefined);
    // The account's answer, late, says it may pin; the guest's own, which came later, is the one told.
    releases[0]?.(ok(list("#bubble", ["m1"], true)));
    await settled();
    expect(t.told).toEqual([]);
    releases[1]?.(ok(list("#bubble", ["m1"])));
    await settled();
    expect(t.told).toEqual([list("#bubble", ["m1"])]);
  });

  // The session changes before the page's effect shows the room again: an answer asked for the last reader, given in
  // between, is the last reader's (F1486, the code review's CR5).
  it("drop an answer given after the session changed, before the room was shown again", async () => {
    let release: (value: Result<PinList>) => void = () => undefined;
    const t = setup({ answer: () => new Promise((resolve) => (release = resolve)) });
    t.asker.show("#bubble", ALICE);
    t.state.reader = undefined; // logged out: the room is not shown again yet
    release(ok(list("#bubble", ["m1"], true)));
    await settled();
    expect(t.told).toEqual([]);
  });

  it("drop the answer of a pin given after the session changed, before the room was shown again", async () => {
    let release: (value: Result<PinList>) => void = () => undefined;
    const t = setup({
      answer: (room, call) =>
        call === "pin" ? new Promise((resolve) => (release = resolve)) : Promise.resolve(ok(list(room, []))),
    });
    t.asker.show("#bubble", ALICE);
    await settled();
    const pinned = t.asker.pin("m2");
    t.state.reader = undefined;
    release(ok(list("#bubble", ["m2"], true)));
    await pinned;
    expect(t.told).toEqual([list("#bubble", [])]);
  });

  it("ask again for a reader who changed, at once", async () => {
    const t = setup();
    t.asker.show("#bubble", ALICE);
    await settled();
    t.asker.show("#bubble", undefined);
    await settled();
    expect(t.asked).toEqual(["pins #bubble", "pins #bubble"]);
  });

  it("are asked no more once stopped, and an answer in flight is dropped", async () => {
    let release: (value: Result<PinList>) => void = () => undefined;
    const t = setup({ answer: () => new Promise((resolve) => (release = resolve)) });
    t.asker.show("#bubble", ALICE);
    t.asker.stop();
    release(ok(list("#bubble", ["m1"])));
    await vi.advanceTimersByTimeAsync(3 * PINS_EVERY_MS);
    expect(t.asked).toHaveLength(1);
    expect(t.told).toEqual([]);
  });
});

describe("pinning and unpinning from the shown room", () => {
  it("send the room and the line's id, and hand the store the list the server answers", async () => {
    const t = setup({ answer: (room) => Promise.resolve(ok(list(room, ["m2", "m1"], true))) });
    t.asker.show("#bubble", ALICE);
    await settled();
    expect(await t.asker.pin("m2")).toEqual({ ok: true });
    expect(t.asked.at(-1)).toBe("pin #bubble m2");
    expect(t.told.at(-1)).toEqual(list("#bubble", ["m2", "m1"], true));
    expect(await t.asker.unpin("m2")).toEqual({ ok: true });
    expect(t.asked.at(-1)).toBe("unpin #bubble m2");
  });

  // A poll asked before the act and answered after it holds the list as it was: taking it would bring an unpinned line
  // back, or take a pinned one off, for the minute (F1485, the code review's CR2).
  it.each([
    ["pin", ["m1", "m2"], ["m1"]],
    ["unpin", ["m1"], ["m1", "m2"]],
  ] as const)("drop a poll's older answer that lands after a %s, and ask again", async (call, after, older) => {
    let release: (value: Result<PinList>) => void = () => undefined;
    let polls = 0;
    const t = setup({
      answer: (room, which) => {
        if (which !== "pins") return Promise.resolve(ok(list(room, [...after], true)));
        polls += 1;
        return polls === 1
          ? new Promise((resolve) => (release = resolve))
          : Promise.resolve(ok(list(room, [...after], true)));
      },
    });
    t.asker.show("#bubble", ALICE);
    await t.asker[call]("m2");
    release(ok(list("#bubble", [...older], true)));
    await settled();
    expect(t.told.map(({ pins }) => pins.map(({ id }) => id))).toEqual([after, after]);
    expect(t.asked.filter((each) => each.startsWith("pins "))).toHaveLength(2);
  });

  it("say why the server refused, and change nothing", async () => {
    const t = setup({ answer: () => Promise.resolve({ ok: false, reason: "too_many" }) });
    t.asker.show("#bubble", ALICE);
    await settled();
    expect(await t.asker.pin("m2")).toEqual({ ok: false, reason: "too_many" });
    expect(await t.asker.unpin("m2")).toEqual({ ok: false, reason: "too_many" });
    expect(t.told).toEqual([]);
  });

  it("ask nothing while no room is shown", async () => {
    const t = setup();
    expect(await t.asker.pin("m2")).toEqual({ ok: false, reason: "refused" });
    expect(await t.asker.unpin("m2")).toEqual({ ok: false, reason: "refused" });
    expect(t.asked).toEqual([]);
  });

  it("restart the minute from the answer, so the next look is not at once", async () => {
    const t = setup();
    t.asker.show("#bubble", ALICE);
    await settled();
    await vi.advanceTimersByTimeAsync(PINS_EVERY_MS - 1000);
    await t.asker.pin("m2");
    await vi.advanceTimersByTimeAsync(PINS_EVERY_MS - 1);
    expect(t.asked.filter((each) => each.startsWith("pins "))).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.asked.filter((each) => each.startsWith("pins "))).toHaveLength(2);
  });

  // The store takes the list each call answers, not the poll's (G7).
  it("hand the store what the pin and the unpin answered, read in full", async () => {
    const t = setup({
      answer: (room, call) => Promise.resolve(ok(list(room, [`from-${call}`], call !== "pins"))),
    });
    t.asker.show("#bubble", ALICE);
    await settled();
    await t.asker.pin("m2");
    await t.asker.unpin("m2");
    expect(t.told).toEqual([
      list("#bubble", ["from-pins"]),
      list("#bubble", ["from-pin"], true),
      list("#bubble", ["from-unpin"], true),
    ]);
  });

  it("drop the answer of a pin that comes after the reader changed, though it is done", async () => {
    let release: (got: Result<PinList>) => void = () => undefined;
    const t = setup({
      answer: (room, call) =>
        call === "pin"
          ? new Promise((resolve) => {
              release = resolve;
            })
          : Promise.resolve(ok(list(room, ["m1"]))),
    });
    t.asker.show("#bubble", ALICE);
    await settled();
    const pinned = t.asker.pin("m2");
    t.asker.show("#bubble", undefined);
    await settled();
    t.told.length = 0;
    release(ok(list("#bubble", ["m2"], true)));
    expect(await pinned).toEqual({ ok: true });
    expect(t.told).toEqual([]);
  });
});
