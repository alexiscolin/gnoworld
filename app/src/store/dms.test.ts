import { parseLine, type IrcMessage } from "@gnoworld/core";
import { describe, expect, it } from "vitest";
import type { DmPrefs } from "../lib/dms/prefs.ts";
import { KNOWN_KEPT } from "../lib/dms/prefs.ts";
import { DMS_KEPT, heardFrom } from "./dms.ts";
import { LINES_KEPT, REACTIONS_KEPT } from "./chat.ts";
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

  // StrykerJS on CR5: a store, or a session with no device, a guest's, says nothing of a device.
  it("says nothing of a device before a session, nor for a session with none", () => {
    const t = as(ACCOUNT);
    expect(t.store.getState().dmNotKept).toBe(false);
    t.store.getState().dmActions.begin();
    expect(t.store.getState().dmNotKept).toBe(false);
  });

  // StrykerJS on CR3's fix: an account written to before, though not last, changes no choice.
  it("notifies no one of an account written to before, though another came since", () => {
    const BOB = toAddress(new Uint8Array(20).fill(9));
    const t = as(ACCOUNT);
    t.store.getState().dmActions.begin({ prefs: prefs().device, drafts: NO_DRAFTS });
    t.store.getState().dmActions.know(ALICE);
    t.store.getState().dmActions.know(BOB);
    let heard = 0;
    t.store.subscribe(() => {
      heard += 1;
    });
    t.store.getState().dmActions.know(ALICE);
    expect(heard).toBe(0);
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

  // /code-review on 4e (CR7): a refusal put its draft back on the device over a draft typed since.
  it("puts a refused line's draft back on the device only where no draft waits", () => {
    const t = as(ACCOUNT);
    const kept = new Map([[ALICE, "typed since"]]);
    const drafts = {
      get: (room: string) => kept.get(room) ?? "",
      set: (room: string, draft: string) => {
        kept.set(room, draft);
        return true;
      },
    };
    t.store.getState().dmActions.begin({ prefs: prefs().device, drafts });
    t.store.getState().dmActions.refused(ALICE, "hi");
    expect(kept.get(ALICE)).toBe("typed since");
    kept.set(ALICE, "");
    t.store.getState().dmActions.refused(ALICE, "again");
    expect(kept.get(ALICE)).toBe("again");
    expect(t.store.getState().dmRefused).toEqual({ [ALICE]: { count: 2, draft: "again" } });
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

// 4d-dm-bar: a direct message's lines get the message bar, so its reactions and deletes are kept as a room's are, by
// partner; Ergo names the target as the sender wrote it (its nick, mine on a line to me).
describe("the store's chat slice: a direct message's reactions and deletes", () => {
  const ME = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
  const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
  const CAROL = "g1pery0j3xzn6wm5m3w8sxkmyafmnd6cle4s3er";
  const BOB = toAddress(new Uint8Array(20).fill(200));
  const store = () => {
    const made = createAppStore();
    made.getState().chatActions.connected(ME);
    return made;
  };
  const say = (id: string, who: { from: string; to: string }, more: { text?: string; second?: number } = {}) => {
    const { text = "hi", second = 0 } = more;
    const { from, to } = who;
    return read(
      `@msgid=${id};time=${new Date(Date.parse(T0) + second * 1000).toISOString()};account=${from} :${from}!u@h PRIVMSG ${to} :${text}`,
    );
  };
  const react = (id: string, who: { from: string; to: string }, tag = "+draft/react=👍") =>
    read(`@msgid=${id};time=${T0};account=${who.from};${tag};+reply=m1 :${who.from}!u@h TAGMSG ${who.to}`);
  const redact = (id: string, who: { from: string; to: string }, line = "m1") =>
    read(`@msgid=${id};time=${T0};account=${who.from} :${who.from}!u@h REDACT ${who.to} ${line}`);

  it("keeps a partner's reaction to my line, and mine as Ergo echoes it, under the partner", () => {
    const t = store();
    t.getState().dmActions.heard(say("m1", { from: ALICE, to: ME }));
    t.getState().dmActions.heard(react("r1", { from: ALICE, to: ME }));
    t.getState().dmActions.heard(react("r2", { from: ME, to: ALICE }, "+draft/react=❤️"));
    expect(t.getState().dmReactions[ALICE]?.map(({ id, who, emoji, on, to }) => [id, who, emoji, on, to])).toEqual([
      ["r1", ALICE, "👍", true, "m1"],
      ["r2", ME, "❤️", true, "m1"],
    ]);
    expect(Object.keys(t.getState().dmReactions)).toEqual([ALICE]);
  });

  it("takes a reaction back when the same account unreacts, and keeps one reaction once Ergo sends it twice", () => {
    const t = store();
    const { heard } = t.getState().dmActions;
    heard(say("m1", { from: ALICE, to: ME }));
    heard(react("r1", { from: ALICE, to: ME }));
    heard(react("r1", { from: ALICE, to: ME }));
    expect(t.getState().dmReactions[ALICE]).toHaveLength(1);
    heard(
      read(
        `@msgid=r3;time=2026-10-25T10:00:01.000Z;account=${ALICE};+draft/unreact=👍;+reply=m1 :${ALICE}!u@h TAGMSG ${ME}`,
      ),
    );
    expect(t.getState().dmReactions[ALICE]?.map(({ id, on }) => [id, on])).toEqual([["r3", false]]);
  });

  it("keeps no reaction to a conversation it holds no line of: a stranger's reactions would grow the store", () => {
    const t = store();
    t.getState().dmActions.heard(react("r1", { from: ALICE, to: ME }));
    expect(t.getState().dmReactions).toEqual({});
  });

  it("keeps no reaction of a room, a guest or a stranger the account does not hear", () => {
    const t = store();
    const { heard, setOnlyKnown } = t.getState().dmActions;
    heard(react("r1", { from: ALICE, to: "#bubble/games" }));
    heard(read(`@msgid=g;time=${T0};+draft/react=👍;+reply=m1 :guest-ab12cd!u@h TAGMSG ${ME}`));
    setOnlyKnown(true);
    heard(react("r2", { from: CAROL, to: ME }));
    expect(t.getState().dmReactions).toEqual({});
  });

  it("takes a line off the conversation at a REDACT, the partner's to me and mine echoed", () => {
    const t = store();
    const { heard } = t.getState().dmActions;
    heard(say("m1", { from: ALICE, to: ME }));
    heard(say("m2", { from: ME, to: ALICE }, { text: "mine", second: 1 }));
    heard(react("r1", { from: ALICE, to: ME }));
    heard(redact("x1", { from: ALICE, to: ME }, "m1"));
    expect(t.getState().dms[ALICE]?.map(({ id }) => id)).toEqual(["m2"]);
    heard(redact("x2", { from: ME, to: ALICE }, "m2"));
    expect(t.getState().dms[ALICE]).toEqual([]);
  });

  // R1 (redpass-dmb): a DM has no moderators, so a REDACT takes a line or a reaction only from its own author.
  it("keeps my line, and my reaction, at a partner's REDACT naming them", () => {
    const t = store();
    const { heard } = t.getState().dmActions;
    heard(say("m1", { from: ALICE, to: ME }));
    heard(say("m2", { from: ME, to: ALICE }, { text: "mine", second: 1 }));
    heard(react("r1", { from: ALICE, to: ME }));
    heard(react("r2", { from: ME, to: ALICE }, "+draft/react=❤️"));
    heard(redact("x1", { from: ALICE, to: ME }, "m2"));
    heard(redact("x2", { from: ALICE, to: ME }, "r2"));
    expect(t.getState().dms[ALICE]?.map(({ id }) => id)).toEqual(["m1", "m2"]);
    expect(t.getState().dmReactions[ALICE]?.map(({ id }) => id)).toEqual(["r1", "r2"]);
  });

  it("keeps the partner's line at a REDACT of mine naming it, as at one of its own", () => {
    const t = store();
    const { heard } = t.getState().dmActions;
    heard(say("m1", { from: ALICE, to: ME }));
    heard(redact("x1", { from: ME, to: ALICE }, "m1"));
    expect(t.getState().dms[ALICE]).toHaveLength(1);
  });

  // R3: a partner's reaction flood grows with the universe, so each conversation's reactions are bound.
  it("bounds a conversation's reactions, the oldest first, and an account's flood keeps another's one", () => {
    const t = store();
    const { heard } = t.getState().dmActions;
    heard(say("m1", { from: ALICE, to: ME }));
    heard(react("mine", { from: ME, to: ALICE }, "+draft/react=❤️"));
    for (let n = 0; n < REACTIONS_KEPT + 50; n += 1)
      heard(
        read(
          `@msgid=f${String(n).padStart(5, "0")};time=${new Date(Date.parse(T0) + (n + 1) * 1000).toISOString()};account=${ALICE};+draft/react=${String.fromCodePoint(0x1f600 + (n % 60))};+reply=m${String(n)} :${ALICE}!u@h TAGMSG ${ME}`,
        ),
      );
    const kept = t.getState().dmReactions[ALICE] ?? [];
    expect(kept.length).toBeLessThanOrEqual(REACTIONS_KEPT);
    expect(kept.some(({ id }) => id === "f00000")).toBe(false);
    expect(kept.some(({ id }) => id === `f${String(REACTIONS_KEPT + 49).padStart(5, "0")}`)).toBe(true);
    expect(kept.some(({ id }) => id === "mine")).toBe(true);
  });

  // R6: a reaction's value is one emoji; markup or a long value leaves no chip.
  it("keeps no reaction whose value is markup or too long to be an emoji", () => {
    const t = store();
    const { heard } = t.getState().dmActions;
    heard(say("m1", { from: ALICE, to: ME }));
    heard(react("r1", { from: ALICE, to: ME }, "+draft/react=<b>x</b>"));
    heard(react("r2", { from: ALICE, to: ME }, `+draft/react=${"x".repeat(2000)}`));
    expect(t.getState().dmReactions[ALICE] ?? []).toEqual([]);
  });

  it("takes a reaction away at a REDACT naming it", () => {
    const t = store();
    const { heard } = t.getState().dmActions;
    heard(say("m1", { from: ALICE, to: ME }));
    heard(react("r1", { from: ALICE, to: ME }));
    heard(redact("x1", { from: ALICE, to: ME }, "r1"));
    expect(t.getState().dmReactions[ALICE]).toEqual([]);
  });

  it("changes nothing, and tells no one, for a REDACT of a line it does not hold", () => {
    const t = store();
    t.getState().dmActions.heard(say("m1", { from: ALICE, to: ME }));
    let heard = 0;
    t.subscribe(() => {
      heard += 1;
    });
    t.getState().dmActions.heard(redact("x1", { from: ALICE, to: ME }, "unknown"));
    expect(heard).toBe(0);
  });

  it("drops a conversation's reactions with the conversation, past the bound", () => {
    const t = store();
    const { heard } = t.getState().dmActions;
    heard(say("a", { from: ALICE, to: ME }));
    heard(react("r1", { from: ALICE, to: ME }));
    for (let n = 0; n < DMS_KEPT; n += 1)
      heard(say(`s${String(n)}`, { from: toAddress(new Uint8Array(20).fill(n + 1)), to: ME }));
    expect(t.getState().dms[ALICE]).toBeUndefined();
    expect(t.getState().dmReactions[ALICE]).toBeUndefined();
  });

  it("keeps the reactions of the conversations still held when another goes past the bound", () => {
    const t = store();
    const { heard } = t.getState().dmActions;
    heard(say("a", { from: ALICE, to: ME }));
    heard(react("r1", { from: ALICE, to: ME }));
    heard(say("c", { from: BOB, to: ME }));
    heard(react("r2", { from: BOB, to: ME }));
    for (let n = 0; n < DMS_KEPT - 1; n += 1)
      heard(say(`s${String(n)}`, { from: toAddress(new Uint8Array(20).fill(n + 1)), to: ME }));
    expect(t.getState().dms[ALICE]).toBeUndefined();
    expect(Object.keys(t.getState().dmReactions)).toEqual([BOB]);
    expect(t.getState().dmReactions[BOB]?.map(({ id }) => id)).toEqual(["r2"]);
  });

  it("keeps a refused delete or reaction by partner until dismissed, and forgets them at a new session", () => {
    const t = store();
    const { actRefused, dismissed, begin } = t.getState().dmActions;
    actRefused(ALICE, { deleted: "m1" });
    actRefused(ALICE, { reacted: true });
    expect(t.getState().dmActRefused).toEqual({ [ALICE]: { deleted: "m1", reacted: true } });
    dismissed(ALICE);
    expect(t.getState().dmActRefused).toEqual({});
    actRefused(CAROL, { reacted: true });
    begin();
    expect(t.getState().dmActRefused).toEqual({});
  });

  it("notifies no one of a dismissal that dismisses nothing", () => {
    const t = store();
    let heard = 0;
    t.subscribe(() => {
      heard += 1;
    });
    t.getState().dmActions.dismissed(ALICE);
    expect(heard).toBe(0);
  });
});
