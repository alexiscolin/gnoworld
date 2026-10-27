import { parseLine } from "@gnoworld/core";
import { Address } from "@gnoworld/schemas";
import { describe, expect, it } from "vitest";
import type { Ergo, ErgoOptions } from "../../lib/ergo/ergo.ts";
import { keep, type SavedLine } from "../../lib/keep/keep.ts";
import { createAppStore } from "../../store/index.ts";
import { chatLink } from "./link.ts";

// 4d's part of the chat's link: at each session's start it hands the keep slice the account's device (what it saved,
// the places it asked to go back to), none for a guest's, and forgets the last session's pins, whose right to pin was
// the last reader's own. Apart from link.test.ts, whose harness is its own.
const ALICE = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const BOB = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const SAVED: SavedLine = {
  room: "#bubble",
  id: "m1",
  time: "2026-10-25T10:00:00.000Z",
  from: BOB,
  account: BOB,
  text: "kept for alice",
};

function setup() {
  const kept = new Map<string, string>();
  const storage = {
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => void kept.set(key, value),
    removeItem: (key: string) => void kept.delete(key),
  };
  keep(() => storage, ALICE).setSaved([SAVED]);
  const store = createAppStore();
  const asked: string[] = [];
  const connections: Pick<ErgoOptions, "onState" | "onLine">[] = [];
  const link = chatLink({
    store,
    ticket: () => Promise.resolve({ ok: true, value: { ticket: "t" } }),
    guest: () => "guest-aaaaaa",
    connect: (_, on) => {
      connections.push(on);
      return { send: () => false, stop: () => undefined, nick: () => undefined } satisfies Ergo;
    },
    keep: (account: Address) => {
      asked.push(account);
      return keep(() => storage, account);
    },
  });
  // A line from Ergo to the last connection.
  const line = (text: string) => {
    const parsed = parseLine(text);
    if (!parsed.ok) throw new Error(`the test's line does not parse: ${text}`);
    connections.at(-1)?.onLine(parsed.message);
  };
  return { store, link, asked, line, ...store.getState().loginActions };
}

describe("the chat's link and what an account keeps on its device", () => {
  it("gives the store the account's device as its session starts, and asks for none before", () => {
    const t = setup();
    expect(t.asked).toEqual([]);
    t.signedIn(ALICE);
    expect(t.asked).toEqual([ALICE]);
    expect(t.store.getState().keep.saved).toEqual([SAVED]);
  });

  it("gives a guest none: it saves nothing and marks nothing, and asks for no device", () => {
    const t = setup();
    t.signedOut();
    expect(t.asked).toEqual([]);
    expect(t.store.getState().keep).toEqual({ saved: [], unread: {}, notKept: false });
    expect(
      t.store
        .getState()
        .keepActions.save("#bubble", { id: "m", time: SAVED.time, from: BOB, text: "x", kind: "message" }),
    ).toBe("none");
  });

  it("forgets one account's lines as another's session starts, each account's being its own", () => {
    const t = setup();
    t.signedIn(ALICE);
    t.signedIn(BOB);
    expect(t.asked).toEqual([ALICE, BOB]);
    expect(t.store.getState().keep.saved).toEqual([]);
    t.signedOut();
    expect(t.store.getState().keep.saved).toEqual([]);
  });

  it("forgets the last session's pins as the session changes: an account's right to pin is not a guest's", () => {
    const t = setup();
    t.signedIn(ALICE);
    t.store.getState().pinsActions.set({ room: "#bubble", may: true, pins: [] });
    t.signedOut();
    expect(t.store.getState().pins).toEqual({});
  });

  // A line taken from a room (Ergo's REDACT: its author's delete, or the bot's hide) leaves the room's pins at once for
  // a reader connected, who would else read it there for the minute until the pins are asked again.
  it("takes a line out of the room's pins as Ergo's REDACT of it comes, and no other room's", () => {
    const t = setup();
    t.signedOut();
    const pin = (id: string) => ({ id, time: SAVED.time, account: BOB, text: id });
    t.store.getState().pinsActions.set({ room: "#bubble/games", may: false, pins: [pin("m1"), pin("m2")] });
    t.store.getState().pinsActions.set({ room: "#bubble", may: false, pins: [pin("m1")] });
    t.line(`:${BOB}!u@h REDACT #bubble/games m1`);
    expect(t.store.getState().pins["#bubble/games"]?.pins.map(({ id }) => id)).toEqual(["m2"]);
    expect(t.store.getState().pins["#bubble"]?.pins.map(({ id }) => id)).toEqual(["m1"]);
  });
});
