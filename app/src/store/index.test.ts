import { parseLine, type IrcMessage } from "@gnoworld/core";
import { Address } from "@gnoworld/schemas";
import { describe, expect, it } from "vitest";
import { keep } from "../lib/keep/keep.ts";
import { createAppStore } from "./index.ts";

// F2091 (AP2): one place ends a session's state, the store's own subscriber, whether or not a chat is open to follow
// it; the link used to do it for the rooms, the keep and the pins, and only when it had known a session before.
const ALICE = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const BOB = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const T = "2026-10-25T10:00:00.000Z";
const read = (line: string): IrcMessage => {
  const parsed = parseLine(line);
  if (!parsed.ok) throw new Error(`the test's line does not parse: ${line}`);
  return parsed.message;
};

// Alice has read a room, which has lines and a reaction, saved a line, and the room has a pin she may remove.
function aliceReading() {
  const kept = new Map<string, string>();
  const storage = {
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => void kept.set(key, value),
    removeItem: (key: string) => void kept.delete(key),
  };
  const store = createAppStore();
  const { loginActions, chatActions, keepActions, pinsActions } = store.getState();
  loginActions.signedIn(ALICE);
  chatActions.follow(["#bubble"]);
  chatActions.heard(read(`@msgid=m1;time=${T};account=${BOB} :${BOB}!u@h PRIVMSG #bubble :hello`));
  chatActions.heard(read(`@msgid=r1;time=${T};account=${BOB};+draft/react=👍;+reply=m1 :${BOB}!u@h TAGMSG #bubble`));
  chatActions.heard(read(`:ergo MARKREAD #bubble timestamp=${T}`));
  keepActions.begin(keep(() => storage, ALICE));
  keepActions.save("#bubble", { id: "m1", time: T, from: BOB, account: BOB, text: "hello", kind: "message" });
  pinsActions.set({ room: "#bubble", may: true, pins: [] });
  return store;
}

describe("a session's end, with no chat open", () => {
  it("holds Alice's reading to begin with", () => {
    const { chat, keep: kept, pins } = aliceReading().getState();
    expect(chat.rooms["#bubble"]?.read).toBe(T);
    expect(chat.rooms["#bubble"]?.lines).toHaveLength(1);
    expect(kept.saved).toHaveLength(1);
    expect(pins["#bubble"]?.may).toBe(true);
  });

  it("leaves nothing of Alice's rooms, saved lines or pins when she logs out", () => {
    const store = aliceReading();
    store.getState().loginActions.signedOut();
    const { chat, keep: kept, pins } = store.getState();
    expect(chat.rooms).toEqual({});
    expect(kept).toEqual({ saved: [], unread: {}, notKept: false });
    expect(pins).toEqual({});
  });

  it("gives the next reader of the same room no read place, line or reaction of Alice's", () => {
    const store = aliceReading();
    store.getState().loginActions.signedOut();
    store.getState().chatActions.follow(["#bubble"]);
    const room = store.getState().chat.rooms["#bubble"];
    expect(room?.read).toBeUndefined();
    expect(room?.lines).toEqual([]);
    expect(room?.reactions ?? []).toEqual([]);
  });

  it("leaves it too when another account logs in at once", () => {
    const store = aliceReading();
    store.getState().loginActions.signedIn(BOB);
    expect(store.getState().chat.rooms).toEqual({});
    expect(store.getState().keep.saved).toEqual([]);
    expect(store.getState().pins).toEqual({});
  });
});
