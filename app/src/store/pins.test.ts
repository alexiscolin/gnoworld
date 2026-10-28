import { parseLine } from "@gnoworld/core";
import { Address, type PinList } from "@gnoworld/schemas";
import { describe, expect, it } from "vitest";
import { createAppStore } from "./index.ts";
import { PINS_ROOMS } from "./pins.ts";

// The pins' slice (slice 4's 4d): each room's pins and whether the reader may pin there, as the server answers
// (GET /api/pins); a slice of its own, as the verdicts', since they come from the server and not from Ergo's lines.
const ALICE = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const list = (room: string, ids: string[], may = false): PinList => ({
  room,
  may,
  pins: ids.map((id) => ({ id, time: "2026-10-25T10:00:00.000Z", account: ALICE, text: `text ${id}` })),
});

describe("the pins slice", () => {
  it("holds no room's pins at first", () => {
    expect(createAppStore().getState().pins).toEqual({});
  });

  it("takes a room's answer as it is, and each room's apart", () => {
    const store = createAppStore();
    const { set } = store.getState().pinsActions;
    set(list("#bubble", ["m1"], true));
    set(list("#bubble/games", ["g1", "g2"]));
    expect(store.getState().pins["#bubble"]).toEqual({ may: true, pins: list("#bubble", ["m1"]).pins });
    expect(store.getState().pins["#bubble/games"]?.pins.map(({ id }) => id)).toEqual(["g1", "g2"]);
    expect(store.getState().pins["#bubble/games"]?.may).toBe(false);
  });

  it("replaces a room's pins by a newer answer, and keeps its place when the answer is the same", () => {
    const store = createAppStore();
    const { set } = store.getState().pinsActions;
    set(list("#bubble", ["m1"]));
    const first = store.getState().pins;
    let heard = 0;
    store.subscribe(() => (heard += 1));
    set(list("#bubble", ["m1"]));
    expect(store.getState().pins).toBe(first);
    expect(heard).toBe(0);
    set(list("#bubble", ["m2", "m1"], true));
    expect(store.getState().pins["#bubble"]?.pins.map(({ id }) => id)).toEqual(["m2", "m1"]);
    expect(store.getState().pins["#bubble"]?.may).toBe(true);
    expect(heard).toBe(1);
  });

  it("changes when only the right to pin changes: a session's end must not leave a moderator's controls", () => {
    const store = createAppStore();
    const { set } = store.getState().pinsActions;
    set(list("#bubble", ["m1"], true));
    set(list("#bubble", ["m1"], false));
    expect(store.getState().pins["#bubble"]?.may).toBe(false);
  });

  it("holds 100 rooms at most, the room answered longest ago going first", () => {
    const store = createAppStore();
    const { set } = store.getState().pinsActions;
    for (let n = 0; n <= 100; n += 1) set(list(`#world-${String(n)}`, ["m1"]));
    const rooms = Object.keys(store.getState().pins);
    expect(rooms).toHaveLength(100);
    expect(rooms).not.toContain("#world-0");
    expect(rooms).toContain("#world-100");
    expect(PINS_ROOMS).toBe(100);
  });

  it("forgets every room's pins when the session changes: another reader's right is its own", () => {
    const store = createAppStore();
    store.getState().pinsActions.set(list("#bubble", ["m1"], true));
    store.getState().pinsActions.forget();
    expect(store.getState().pins).toEqual({});
    // Nothing to forget: no change to tell.
    let heard = 0;
    store.subscribe(() => (heard += 1));
    store.getState().pinsActions.forget();
    expect(heard).toBe(0);
  });

  it("reads a room named __proto__ as a room, never as a change to every room", () => {
    const store = createAppStore();
    store.getState().pinsActions.set(list("__proto__", ["m1"]));
    expect(Object.keys(store.getState().pins)).toEqual([]);
  });

  it("takes a line out of its room's pins, and changes nothing for a line or a room it does not hold", () => {
    const store = createAppStore();
    const { set, redacted } = store.getState().pinsActions;
    set(list("#bubble", ["m1", "m2"], true));
    const before = store.getState().pins;
    redacted("#bubble", "nope");
    redacted("#elsewhere", "m1");
    expect(store.getState().pins).toBe(before);
    redacted("#bubble", "m1");
    expect(store.getState().pins["#bubble"]).toEqual({ may: true, pins: list("#bubble", ["m2"]).pins });
  });

  // An answer asked before a line's REDACT and given after it must not bring its pin back for the minute until the next
  // (4d's R19): the lines taken from rooms are remembered, as many as 500.
  it("keeps a line taken from its room out of a late answer that still holds it", () => {
    const store = createAppStore();
    const { set, redacted } = store.getState().pinsActions;
    set(list("#bubble", ["m1", "m2"]));
    redacted("#bubble", "m1");
    set(list("#bubble", ["m1", "m2"]));
    expect(store.getState().pins["#bubble"]?.pins.map(({ id }) => id)).toEqual(["m2"]);
    // Also for a room the page held nothing of when the line was taken.
    redacted("#bubble/games", "g1");
    set(list("#bubble/games", ["g1", "g2"]));
    expect(store.getState().pins["#bubble/games"]?.pins.map(({ id }) => id)).toEqual(["g2"]);
    // Another room's line of the same id is another line.
    set(list("#bubble/news", ["m1"]));
    expect(store.getState().pins["#bubble/news"]?.pins.map(({ id }) => id)).toEqual(["m1"]);
  });

  it("forgets the lines taken longest ago, past 500", () => {
    const store = createAppStore();
    const { set, redacted } = store.getState().pinsActions;
    for (let n = 0; n <= 500; n += 1) redacted("#bubble", `m${String(n)}`);
    set(list("#bubble", ["m0", "m1", "m500"]));
    expect(store.getState().pins["#bubble"]?.pins.map(({ id }) => id)).toEqual(["m0"]);
  });

  // Ergo's REDACT as the link hands it on: a room and a line's id, a reason after them or none.
  it("takes Ergo's REDACT of a line as a line taken from its room, and no other line of Ergo's", () => {
    const store = createAppStore();
    const { set, heard } = store.getState().pinsActions;
    const line = (text: string) => {
      const parsed = parseLine(text);
      if (!parsed.ok) throw new Error(`the test's line does not parse: ${text}`);
      return parsed.message;
    };
    set(list("#bubble", ["m1", "m2", "m3"]));
    heard(line(`:${ALICE}!u@h REDACT #bubble m1 :spam`));
    heard(line(`:${ALICE}!u@h REDACT #bubble m2`));
    heard(line(`:${ALICE}!u@h REDACT #bubble`));
    heard(line(`:${ALICE}!u@h PRIVMSG #bubble :REDACT #bubble m3`));
    expect(store.getState().pins["#bubble"]?.pins.map(({ id }) => id)).toEqual(["m3"]);
  });

  // A message whose text is a pinned id is a message: only Ergo's REDACT command takes a line (G1).
  it.each(["PRIVMSG", "NOTICE", "TAGMSG", "JOIN"])("keeps a pin whose id is the text of a %s", (command) => {
    const store = createAppStore();
    const { set, heard } = store.getState().pinsActions;
    const parsed = parseLine(`:${ALICE}!u@h ${command} #bubble :m3`);
    if (!parsed.ok) throw new Error("the test's line does not parse");
    set(list("#bubble", ["m3"]));
    heard(parsed.message);
    expect(store.getState().pins["#bubble"]?.pins.map(({ id }) => id)).toEqual(["m3"]);
    set(list("#bubble", ["m3"]));
    expect(store.getState().pins["#bubble"]?.pins.map(({ id }) => id)).toEqual(["m3"]);
  });

  it("takes a new answer whose pins are not the same, of the same size or a longer one", () => {
    const store = createAppStore();
    const { set } = store.getState().pinsActions;
    set(list("#bubble", ["m1", "m2"]));
    set(list("#bubble", ["m1", "m9"]));
    expect(store.getState().pins["#bubble"]?.pins.map(({ id }) => id)).toEqual(["m1", "m9"]);
    set(list("#bubble", ["m1"]));
    set(list("#bubble", ["m1", "m9"]));
    expect(store.getState().pins["#bubble"]?.pins.map(({ id }) => id)).toEqual(["m1", "m9"]);
    set(list("#bubble", ["m1", "m9"], true));
    expect(store.getState().pins["#bubble"]?.may).toBe(true);
  });
});
