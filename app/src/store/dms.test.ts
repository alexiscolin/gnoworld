import { parseLine, type IrcMessage } from "@gnoworld/core";
import { describe, expect, it } from "vitest";
import { createAppStore } from "./index.ts";

const T0 = "2026-10-25T10:00:00.000Z";
const read = (line: string): IrcMessage => {
  const parsed = parseLine(line);
  if (!parsed.ok) throw new Error(`the test's line does not parse: ${line}`);
  return parsed.message;
};

// 4e: direct messages, kept by partner, an account's alone (docs/plans/slice-4.md §7).
describe("the store's chat slice: direct messages", () => {
  const ACCOUNT = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
  const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
  // A message `from` an account `to` a nick, `second` seconds after T0.
  const dm = (
    id: string,
    { from, to, text, second = 0 }: { from: string; to: string; text: string; second?: number },
  ) =>
    read(
      `@msgid=${id};time=${new Date(Date.parse(T0) + second * 1000).toISOString()};account=${from} :${from}!u@h PRIVMSG ${to} :${text}`,
    );
  const as = (me: string) => {
    const store = createAppStore();
    store.getState().chatActions.connected(me);
    const { chatActions, dmActions } = store.getState();
    return { store, ...chatActions, heard: dmActions.heard, dms: () => store.getState().dms };
  };

  it("keeps an account's message to me and mine to it, as Ergo echoes it, in time order, under that account", () => {
    const t = as(ACCOUNT);
    t.heard(dm("b", { from: ACCOUNT, to: ALICE, text: "hello", second: 1 }));
    t.heard(dm("a", { from: ALICE, to: ACCOUNT, text: "hi", second: 0 }));
    expect(t.dms()[ALICE]?.map((line) => [line.id, line.text])).toEqual([
      ["a", "hi"],
      ["b", "hello"],
    ]);
    expect(Object.keys(t.dms())).toEqual([ALICE]);
  });

  it("keeps a message once though Ergo sends it twice, notifying no one of the second, and the conversations through a disconnect", () => {
    const t = as(ACCOUNT);
    t.heard(dm("a", { from: ALICE, to: ACCOUNT, text: "hi" }));
    let heard = 0;
    t.store.subscribe(() => {
      heard += 1;
    });
    t.heard(dm("a", { from: ALICE, to: ACCOUNT, text: "hi" }));
    expect(heard).toBe(0);
    t.disconnected();
    expect(t.dms()[ALICE]).toHaveLength(1);
  });

  it("keeps none for a guest, nor from a partner that is no account's address", () => {
    const guest = as("guest-ab12cd");
    guest.heard(dm("a", { from: ALICE, to: "guest-ab12cd", text: "hi" }));
    expect(guest.dms()).toEqual({});
    const t = as(ACCOUNT);
    t.heard(read(`@msgid=n;time=${T0};account=NickServ :NickServ!NickServ@localhost NOTICE ${ACCOUNT} :hello`));
    expect(t.dms()).toEqual({});
  });

  it("notifies no one of a line that is no direct message", () => {
    const t = as(ACCOUNT);
    let heard = 0;
    t.store.subscribe(() => {
      heard += 1;
    });
    t.heard(dm("a", { from: ALICE, to: "#bubble", text: "a room's line" }));
    expect(heard).toBe(0);
  });
});
