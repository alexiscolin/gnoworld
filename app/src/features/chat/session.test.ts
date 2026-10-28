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
  // `blind`: the device cannot be read; `writes`: how many times it was written.
  const state = { blind: false, writes: 0 };
  const storage = {
    getItem: (key: string) => {
      if (state.blind) throw new DOMException("blocked", "SecurityError");
      return kept.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      state.writes += 1;
      kept.set(key, value);
    },
    removeItem: (key: string) => {
      state.writes += 1;
      kept.delete(key);
    },
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
      return {
        send: () => false,
        stop: () => undefined,
        nick: () => undefined,
        multiline: () => undefined,
      } satisfies Ergo;
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
  return {
    store,
    link,
    asked,
    state,
    line,
    device: () => keep(() => storage, ALICE),
    ...store.getState().loginActions,
  };
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

  // A copy on the device outlives the line unless the page hears it go: Ergo's REDACT unsaves it, and its author's edit
  // replaces its words, as for the room and its pins (F1484, the security review's S2).
  it("takes a saved line off the device as Ergo's REDACT of it comes, and no other room's", () => {
    const t = setup();
    t.signedIn(ALICE);
    t.line(`:${BOB}!u@h REDACT #bubble/games m1`);
    expect(t.store.getState().keep.saved).toEqual([SAVED]);
    t.line(`:${BOB}!u@h REDACT #bubble m1`);
    expect(t.store.getState().keep.saved).toEqual([]);
    expect(t.device().saved()).toEqual([]);
  });

  it("replaces a saved line's words by its author's edit, and by no one else's", () => {
    const t = setup();
    t.signedIn(ALICE);
    const edit = (account: string, text: string) => {
      t.line(
        `@msgid=m2;time=2026-10-25T10:01:00.000Z;account=${account};+gnoworld/edit=m1 :x!u@h PRIVMSG #bubble :${text}`,
      );
    };
    edit(ALICE, "not by its author");
    expect(t.store.getState().keep.saved).toEqual([SAVED]);
    edit(BOB, "corrected words");
    expect(t.store.getState().keep.saved).toEqual([{ ...SAVED, text: "corrected words" }]);
    expect(t.device().saved()).toEqual([{ ...SAVED, text: "corrected words" }]);
  });

  it("unsaves a line its author edited into one that is no plain message", () => {
    const t = setup();
    t.signedIn(ALICE);
    t.line(
      `@msgid=m2;time=2026-10-25T10:01:00.000Z;account=${BOB};+gnoworld/edit=m1 :x!u@h PRIVMSG #bubble :\u0001ACTION waves\u0001`,
    );
    expect(t.store.getState().keep.saved).toEqual([]);
  });

  // The device's copy follows the room's own rule (core's foldEdits): an edit with no account proves no author, so a
  // guest's saved line, which has none either, is not its to rewrite (R1 of redpass2-4dx).
  it("leaves a guest's saved line as it is for an edit that carries no account", () => {
    const t = setup();
    const guestLine: SavedLine = {
      room: "#bubble",
      id: "g1",
      time: SAVED.time,
      from: "guest-ab12cd",
      text: "guest words",
    };
    t.device().setSaved([guestLine]);
    t.signedIn(ALICE);
    t.line("@msgid=m2;time=2026-10-25T10:01:00.000Z;+gnoworld/edit=g1 :guest-zzzzzz!u@h PRIVMSG #bubble :rewritten");
    expect(t.store.getState().keep.saved).toEqual([guestLine]);
    expect(t.device().saved()).toEqual([guestLine]);
  });

  // The edit is by the line's room: an edit of the same id in another room corrects no saved line of this one (R2).
  it("replaces no saved line by an edit of the same id in another room", () => {
    const t = setup();
    t.signedIn(ALICE);
    t.line(
      `@msgid=m2;time=2026-10-25T10:01:00.000Z;account=${BOB};+gnoworld/edit=m1 :x!u@h PRIVMSG #bubble/games :other room`,
    );
    expect(t.store.getState().keep.saved).toEqual([SAVED]);
    expect(t.device().saved()).toEqual([SAVED]);
  });

  // What Ergo says of a line is heard by the device the session holds, and only by it (R6 of redpass2-4dx).
  describe("hearing a line taken back", () => {
    const REDACT = `:${BOB}!u@h REDACT #bubble m1`;
    const EDIT = `@msgid=m2;time=2026-10-25T10:01:00.000Z;account=${BOB};+gnoworld/edit=m1 :x!u@h PRIVMSG #bubble :corrected`;

    it.each([
      ["a REDACT", REDACT],
      ["an edit", EDIT],
    ])("writes nothing over a device it could not read, as %s comes", (_, heard) => {
      const t = setup();
      t.state.blind = true;
      t.signedIn(ALICE);
      t.state.blind = false;
      const writes = t.state.writes;
      t.line(heard);
      expect(t.state.writes).toBe(writes);
      expect(t.device().saved()).toEqual([SAVED]);
      expect(t.store.getState().keep.notKept).toBe(true);
    });

    it.each([
      ["a REDACT", REDACT],
      ["an edit", EDIT],
    ])("touches no account's device in a guest's session, or after a logout, as %s comes", (_, heard) => {
      const t = setup();
      t.signedIn(ALICE);
      t.signedOut();
      const writes = t.state.writes;
      t.line(heard);
      expect(t.state.writes).toBe(writes);
      expect(t.device().saved()).toEqual([SAVED]);
      expect(t.store.getState().keep.saved).toEqual([]);
    });

    it("unsaves a line another tab saved, which this page's memory does not hold", () => {
      const t = setup();
      t.signedIn(ALICE);
      const other: SavedLine = { ...SAVED, id: "m9", text: "saved by another tab" };
      t.device().setSaved([other, SAVED]);
      t.line(`:${BOB}!u@h REDACT #bubble m9`);
      expect(t.device().saved()).toEqual([SAVED]);
      expect(t.store.getState().keep.saved).toEqual([SAVED]);
    });

    it("keeps a line another tab saved when it takes another line off, from the device's own list", () => {
      const t = setup();
      t.signedIn(ALICE);
      const other: SavedLine = { ...SAVED, id: "m9", text: "saved by another tab" };
      t.device().setSaved([other, SAVED]);
      t.line(REDACT);
      expect(t.device().saved()).toEqual([other]);
      expect(t.store.getState().keep.saved).toEqual([other]);
    });
  });
});
