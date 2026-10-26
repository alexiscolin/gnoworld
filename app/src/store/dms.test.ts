import { parseLine, type IrcMessage } from "@gnoworld/core";
import { describe, expect, it } from "vitest";
import type { DmPrefs } from "../lib/dms/prefs.ts";
import { KNOWN_KEPT } from "../lib/dms/prefs.ts";
import { DMS_KEPT, heardFrom } from "./dms.ts";
import { LINES_KEPT } from "./chat.ts";
import { toAddress } from "@gnoworld/schemas";
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
    // StrykerJS on 4e: a refusal held with a conversation, both forgotten; one with no device counted all the same.
    t.store.getState().dmActions.refused(ALICE, "lost");
    expect(t.store.getState().dmRefused).toEqual({ [ALICE]: { count: 1, draft: "lost" } });
    t.store.getState().dmActions.begin();
    expect(t.dms()).toEqual({});
    expect(t.store.getState().dmRefused).toEqual({});
    let heard = 0;
    t.store.subscribe(() => {
      heard += 1;
    });
    t.store.getState().dmActions.begin();
    expect(heard).toBe(0);
  });

  // A device's choices for the account, each read and write counted.
  function prefs({ onlyKnown = false, known = [] as string[], unreadable = false, refusing = false } = {}) {
    const calls = { onlyKnown: 0, known: 0, setOnlyKnown: [] as boolean[], setKnown: [] as string[][] };
    const device: DmPrefs = {
      onlyKnown: () => {
        calls.onlyKnown += 1;
        return onlyKnown;
      },
      setOnlyKnown: (only) => {
        calls.setOnlyKnown.push(only);
        return !refusing;
      },
      known: () => {
        calls.known += 1;
        return unreadable ? undefined : known;
      },
      setKnown: (partners) => {
        calls.setKnown.push([...partners]);
        return !refusing;
      },
    };
    return { device, calls };
  }
  // A device's drafts, for the choices' tests: none kept.
  const NO_DRAFTS = { get: () => "", set: () => true };

  // 4e's complexity and efficiency reviews: the page read the device again, JSON and schema, for each line.
  it("reads an account's choices from its device once, at its session's start, whatever it hears after", () => {
    const t = as(ACCOUNT);
    const { device, calls } = prefs({ onlyKnown: true, known: [ALICE] });
    t.store.getState().dmActions.begin({ prefs: device, drafts: NO_DRAFTS });
    for (const id of ["a", "b", "c"]) t.heard(dm(id, { from: ALICE, to: ACCOUNT, text: "hi" }));
    expect(t.store.getState().dmChoices).toEqual({ onlyKnown: true, known: new Set([ALICE]) });
    expect([calls.onlyKnown, calls.known]).toEqual([1, 1]);
  });

  it("chooses nothing for a session with no device, a guest's: everyone's messages heard", () => {
    const t = as(ACCOUNT);
    t.store.getState().dmActions.begin({ prefs: prefs({ onlyKnown: true, known: [ALICE] }).device, drafts: NO_DRAFTS });
    t.store.getState().dmActions.begin();
    expect(t.store.getState().dmChoices).toEqual({ onlyKnown: false, known: new Set() });
    t.store.getState().dmActions.setOnlyKnown(true);
    expect(t.store.getState().dmChoices.onlyKnown).toBe(true);
  });

  it("keeps a new choice on the device, and writes nor notifies anything for the same one", () => {
    const t = as(ACCOUNT);
    const { device, calls } = prefs();
    t.store.getState().dmActions.begin({ prefs: device, drafts: NO_DRAFTS });
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
    t.store.getState().dmActions.begin({ prefs: device, drafts: NO_DRAFTS });
    t.store.getState().dmActions.know(ALICE);
    expect(t.store.getState().dmChoices.known).toEqual(new Set([ALICE]));
    let heard = 0;
    t.store.subscribe(() => {
      heard += 1;
    });
    t.store.getState().dmActions.know(ALICE);
    expect(heard).toBe(0);
    expect(calls.setKnown).toEqual([[ALICE]]);
  });

  // /code-review on 4e (CR3): each echo of my line read the device again, JSON and schema over up to 500 addresses,
  // and wrote 21 KB back whenever the partner changed.
  it("reads the accounts written to once a session, and writes them only when the last one changes", () => {
    const BOB = toAddress(new Uint8Array(20).fill(9));
    const t = as(ACCOUNT);
    const { device, calls } = prefs({ known: [BOB] });
    t.store.getState().dmActions.begin({ prefs: device, drafts: NO_DRAFTS });
    for (const partner of [ALICE, ALICE, BOB, BOB, ALICE]) t.store.getState().dmActions.know(partner);
    expect(calls.known).toBe(1);
    expect(calls.setKnown).toEqual([
      [BOB, ALICE],
      [ALICE, BOB],
      [BOB, ALICE],
    ]);
    expect(t.store.getState().dmChoices.known).toEqual(new Set([BOB, ALICE]));
  });

  it(`keeps the ${String(KNOWN_KEPT)} accounts written to last, on the device and in the choices`, () => {
    const t = as(ACCOUNT);
    const { device, calls } = prefs();
    t.store.getState().dmActions.begin({ prefs: device, drafts: NO_DRAFTS });
    const many = Array.from({ length: KNOWN_KEPT + 1 }, (_, n) =>
      toAddress(new Uint8Array(20).fill(n % 256).fill(n >> 8, 0, 1)),
    );
    for (const partner of many) t.store.getState().dmActions.know(partner);
    expect(calls.setKnown.at(-1)).toEqual(many.slice(1));
    expect(t.store.getState().dmChoices.known.size).toBe(KNOWN_KEPT);
    expect(t.store.getState().dmChoices.known.has(many[0] ?? "")).toBe(false);
  });

  // /code-review on 4e (CR5): a device that refused a write said so to nobody, though DmPrefs answers whether it kept it.
  it("says the choices are not kept on a device that refused one, or that it could not read, until a new session", () => {
    const kept = as(ACCOUNT);
    kept.store.getState().dmActions.begin({ prefs: prefs().device, drafts: NO_DRAFTS });
    kept.store.getState().dmActions.setOnlyKnown(true);
    kept.store.getState().dmActions.know(ALICE);
    expect(kept.store.getState().dmNotKept).toBe(false);
    for (const refused of [
      (t: ReturnType<typeof as>) => {
        t.store.getState().dmActions.setOnlyKnown(true);
      },
      (t: ReturnType<typeof as>) => {
        t.store.getState().dmActions.know(ALICE);
      },
    ]) {
      const t = as(ACCOUNT);
      t.store.getState().dmActions.begin({ prefs: prefs({ refusing: true }).device, drafts: NO_DRAFTS });
      expect(t.store.getState().dmNotKept).toBe(false);
      refused(t);
      expect(t.store.getState().dmNotKept).toBe(true);
      t.store.getState().dmActions.begin({ prefs: prefs().device, drafts: NO_DRAFTS });
      expect(t.store.getState().dmNotKept).toBe(false);
    }
    const unread = as(ACCOUNT);
    unread.store.getState().dmActions.begin({ prefs: prefs({ unreadable: true }).device, drafts: NO_DRAFTS });
    expect(unread.store.getState().dmNotKept).toBe(true);
  });

  // /code-review on 4e (CR4): a device that could not be read is never written over.
  it("writes no account written to on a device it could not read", () => {
    const t = as(ACCOUNT);
    const { device, calls } = prefs({ unreadable: true });
    t.store.getState().dmActions.begin({ prefs: device, drafts: NO_DRAFTS });
    t.store.getState().dmActions.know(ALICE);
    expect(t.store.getState().dmChoices.known).toEqual(new Set([ALICE]));
    expect(calls.setKnown).toEqual([]);
  });

  // 4e's late test audit (T7) and UX review (U1): the page noted an account written to as it sent, before Ergo
  // delivered the line, which Ergo refuses when that account is not connected.
  it("notes an account written to once Ergo echoes my line to it, never for its line to me", () => {
    const t = as(ACCOUNT);
    const { device, calls } = prefs();
    t.store.getState().dmActions.begin({ prefs: device, drafts: NO_DRAFTS });
    t.heard(dm("a", { from: ALICE, to: ACCOUNT, text: "hi" }));
    expect(t.store.getState().dmChoices.known).toEqual(new Set());
    t.heard(dm("b", { from: ACCOUNT, to: ALICE, text: "hello", second: 1 }));
    expect(t.store.getState().dmChoices.known).toEqual(new Set([ALICE]));
    expect(calls.setKnown).toEqual([[ALICE]]);
  });

  // 4e's UX review (U1): a line Ergo refused, its partner not connected, has its draft back in the composer.
  it("puts a refused line's draft back on the device, counting the partner's refusals until a new session", () => {
    const t = as(ACCOUNT);
    const written: [string, string][] = [];
    const drafts = {
      get: () => "",
      set: (room: string, draft: string) => {
        written.push([room, draft]);
        return true;
      },
    };
    t.store.getState().dmActions.begin({ prefs: prefs().device, drafts });
    t.store.getState().dmActions.refused(ALICE, "hi");
    t.store.getState().dmActions.refused(ALICE, "again");
    expect(written).toEqual([
      [ALICE, "hi"],
      [ALICE, "again"],
    ]);
    expect(t.store.getState().dmRefused).toEqual({ [ALICE]: { count: 2, draft: "again" } });
    t.store.getState().dmActions.begin();
    expect(t.store.getState().dmRefused).toEqual({});
  });

  // 4e's decision B (T5, U3): "refused" means discarded. A stranger's message was kept, hidden, and shown once the
  // account heard everyone again; a flood of strangers grew the store all the while.
  it("keeps no message from an account never written to while it hears those alone, nor shows it once it hears everyone", () => {
    const t = as(ACCOUNT);
    t.store.getState().dmActions.begin({ prefs: prefs({ onlyKnown: true }).device, drafts: NO_DRAFTS });
    let heard = 0;
    t.store.subscribe(() => {
      heard += 1;
    });
    t.heard(dm("a", { from: ALICE, to: ACCOUNT, text: "spam" }));
    expect(t.dms()).toEqual({});
    expect(heard).toBe(0);
    t.store.getState().dmActions.setOnlyKnown(false);
    expect(t.dms()).toEqual({});
  });

  it("keeps my line to a stranger and its answer while the account hears those it wrote to alone", () => {
    const t = as(ACCOUNT);
    t.store.getState().dmActions.begin({ prefs: prefs({ onlyKnown: true }).device, drafts: NO_DRAFTS });
    t.heard(dm("a", { from: ACCOUNT, to: ALICE, text: "hello" }));
    t.heard(dm("b", { from: ALICE, to: ACCOUNT, text: "hi", second: 1 }));
    expect(t.dms()[ALICE]?.map(({ id }) => id)).toEqual(["a", "b"]);
  });

  // 4e's complexity review (2-3), efficiency review (6) and test audit (T4): conversations were kept without end, a
  // spammer with an account a message growing the store and the navigation.
  it(`keeps the ${String(DMS_KEPT)} conversations heard last, the oldest heard going first, each its newest ${String(LINES_KEPT)} lines`, () => {
    expect(DMS_KEPT).toBe(100);
    const t = as(ACCOUNT);
    const partners = Array.from({ length: DMS_KEPT + 1 }, (_, n) => toAddress(new Uint8Array(20).fill(n + 1)));
    const [first = "", second = "", ...rest] = partners;
    t.heard(dm("a", { from: first, to: ACCOUNT, text: "hi" }));
    t.heard(dm("b", { from: second, to: ACCOUNT, text: "hi" }));
    for (const [n, partner] of rest.entries()) t.heard(dm(`c${String(n)}`, { from: partner, to: ACCOUNT, text: "hi" }));
    t.heard(dm("d", { from: first, to: ACCOUNT, text: "again", second: 1 }));
    expect(Object.keys(t.dms())).toEqual([...rest, first]);
    for (let n = 0; n <= LINES_KEPT; n += 1)
      t.heard(dm(`e${String(n)}`, { from: first, to: ACCOUNT, text: "x", second: n + 2 }));
    expect(t.dms()[first]).toHaveLength(LINES_KEPT);
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
