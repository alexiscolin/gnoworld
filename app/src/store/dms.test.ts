import { parseLine, type IrcMessage } from "@gnoworld/core";
import { describe, expect, it } from "vitest";
import type { DmPrefs } from "../lib/dms/prefs.ts";
import { heardFrom } from "./dms.ts";
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

  it("forgets every conversation at a new session, notifying no one when it held none", () => {
    const t = as(ACCOUNT);
    t.heard(dm("a", { from: ALICE, to: ACCOUNT, text: "hi" }));
    t.store.getState().dmActions.begin();
    expect(t.dms()).toEqual({});
    let heard = 0;
    t.store.subscribe(() => {
      heard += 1;
    });
    t.store.getState().dmActions.begin();
    expect(heard).toBe(0);
  });

  // A device's choices for the account, each read and write counted.
  function prefs({ onlyKnown = false, known = [] as string[] } = {}) {
    const calls = { onlyKnown: 0, known: 0, setOnlyKnown: [] as boolean[], know: [] as string[] };
    const device: DmPrefs = {
      onlyKnown: () => {
        calls.onlyKnown += 1;
        return onlyKnown;
      },
      setOnlyKnown: (only) => {
        calls.setOnlyKnown.push(only);
        return true;
      },
      known: () => {
        calls.known += 1;
        return known;
      },
      know: (partner) => {
        calls.know.push(partner);
        return true;
      },
    };
    return { device, calls };
  }

  // 4e's complexity and efficiency reviews: the page read the device again, JSON and schema, for each line.
  it("reads an account's choices from its device once, at its session's start, whatever it hears after", () => {
    const t = as(ACCOUNT);
    const { device, calls } = prefs({ onlyKnown: true, known: [ALICE] });
    t.store.getState().dmActions.begin({ prefs: device });
    for (const id of ["a", "b", "c"]) t.heard(dm(id, { from: ALICE, to: ACCOUNT, text: "hi" }));
    expect(t.store.getState().dmChoices).toEqual({ onlyKnown: true, known: new Set([ALICE]) });
    expect([calls.onlyKnown, calls.known]).toEqual([1, 1]);
  });

  it("chooses nothing for a session with no device, a guest's: everyone's messages heard", () => {
    const t = as(ACCOUNT);
    t.store.getState().dmActions.begin({ prefs: prefs({ onlyKnown: true, known: [ALICE] }).device });
    t.store.getState().dmActions.begin();
    expect(t.store.getState().dmChoices).toEqual({ onlyKnown: false, known: new Set() });
    t.store.getState().dmActions.setOnlyKnown(true);
    expect(t.store.getState().dmChoices.onlyKnown).toBe(true);
  });

  it("keeps a new choice on the device, and writes nor notifies anything for the same one", () => {
    const t = as(ACCOUNT);
    const { device, calls } = prefs();
    t.store.getState().dmActions.begin({ prefs: device });
    t.store.getState().dmActions.setOnlyKnown(true);
    expect(t.store.getState().dmChoices.onlyKnown).toBe(true);
    let heard = 0;
    t.store.subscribe(() => {
      heard += 1;
    });
    t.store.getState().dmActions.setOnlyKnown(true);
    expect(heard).toBe(0);
    expect(calls.setOnlyKnown).toEqual([true]);
  });

  it("notes an account written to in the choices and on the device, notifying no one of one known", () => {
    const t = as(ACCOUNT);
    const { device, calls } = prefs();
    t.store.getState().dmActions.begin({ prefs: device });
    t.store.getState().dmActions.know(ALICE);
    expect(t.store.getState().dmChoices.known).toEqual(new Set([ALICE]));
    let heard = 0;
    t.store.subscribe(() => {
      heard += 1;
    });
    t.store.getState().dmActions.know(ALICE);
    expect(heard).toBe(0);
    expect(calls.know).toEqual([ALICE, ALICE]);
  });

  it.each([
    ["anyone, while the account hears everyone", { onlyKnown: false, known: [] }, true],
    ["an account it wrote to, while it hears those alone", { onlyKnown: true, known: [ALICE] }, true],
    ["an account it never wrote to, while it hears those alone", { onlyKnown: true, known: [] }, false],
  ])("hears %s", (_, { onlyKnown, known }, heard) => {
    expect(heardFrom({ onlyKnown, known: new Set(known) }, ALICE)).toBe(heard);
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
