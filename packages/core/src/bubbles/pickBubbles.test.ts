import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";
import data from "../../../../app/data/bubbles.json" with { type: "json" };
import { cutText } from "./cut.ts";
import { pickBubbles, type Bubble, type BubbleMessage, type Viewer } from "./pickBubbles.ts";
import type { Rules } from "./rules.ts";

// Slice 6's 6a: the rules of ADR-0001 §7 (docs/plans/slice-6.md §1), as one pure function. Every number is read from
// app/data/bubbles.json, so tuning that file never breaks a test. Time is a parameter, in milliseconds.
const RULES: Rules = data;
const SHOW = RULES.showSeconds * 1000;
const DELAY = RULES.speakerDelaySeconds * 1000;
const NOW = Date.UTC(2026, 9, 31, 12, 0, 0);
const CODES = "JP FR DE US BR IN CA AU IT ES MX KR NL SE NO FI DK PL PT IE CH AT BE GR TR AR CL CO PE NZ".split(" ");
const ME: Viewer = { account: "me", muted: [], banned: [] };

afterEach(() => {
  vi.restoreAllMocks();
});

/** A public message of a joined room, `ageMs` old at NOW, from its own account in its own country (index into CODES). */
function msg(n: number, over: Partial<BubbleMessage> = {}): BubbleMessage {
  return {
    id: `m${String(n)}`,
    at: NOW - 1000 - n,
    account: `acct${String(n)}`,
    text: `hello ${String(n)}`,
    country: CODES[n % CODES.length] ?? "JP",
    visibility: "public",
    joined: true,
    ...over,
  };
}
const many = (count: number, over: (n: number) => Partial<BubbleMessage> = () => ({})): BubbleMessage[] =>
  Array.from({ length: count }, (_, n) => msg(n, over(n)));
const ids = (list: readonly { id: string }[]): string[] => list.map((b) => b.id);
const pick = (
  messages: readonly BubbleMessage[],
  viewer: Viewer = ME,
  state: { shown?: readonly Bubble[]; now?: number } = {},
) => pickBubbles(messages, state.now ?? NOW, viewer, RULES, state.shown ?? []);
const countOf = (counts: readonly { country: string; count: number }[], country: string): number =>
  counts.find((c) => c.country === country)?.count ?? 0;
const noCountry = (m: BubbleMessage): BubbleMessage => {
  const copy = { ...m };
  delete copy.country;
  return copy;
};
const graphemes = (text: string): number => Array.from(new Intl.Segmenter().segment(text)).length;

describe("the caps", () => {
  it("shows nothing for nothing", () => {
    expect(pick([])).toEqual({ bubbles: [], counts: [], shown: [] });
  });

  it("shows one message as a bubble, its text cut, its speaker's country and the time it began", () => {
    const [bubble] = pick([msg(1)]).bubbles;
    expect(bubble).toMatchObject({
      id: "m1",
      account: "acct1",
      country: "FR",
      text: "hello 1",
      since: NOW,
      until: NOW + SHOW,
      own: false,
    });
  });

  it("shows at most maxOnScreen bubbles, the newest, and counts the other countries", () => {
    const messages = many(RULES.maxOnScreen + 4);
    const out = pick(messages);
    expect(ids(out.bubbles)).toEqual(ids(messages.slice(0, RULES.maxOnScreen)));
    const rest = messages.slice(RULES.maxOnScreen);
    expect(out.counts.map((c) => [c.country, c.count])).toEqual(
      rest.map((m) => [m.country, 1]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    );
  });

  it("holds the cap across calls: bubbles still on screen use their places", () => {
    const first = pick(many(RULES.maxOnScreen));
    const later = [
      ...many(RULES.maxOnScreen),
      ...many(3, (n) => ({
        id: `x${String(n)}`,
        account: `x${String(n)}`,
        country: CODES[RULES.maxOnScreen + n] ?? "JP",
      })),
    ];
    const out = pick(later, ME, { shown: first.shown, now: NOW + 1000 });
    expect(out.bubbles).toHaveLength(RULES.maxOnScreen);
    expect(ids(out.bubbles)).toEqual(ids(first.bubbles));
  });

  it("frees a place when a bubble's time is over: the last millisecond it shows, and the first it does not", () => {
    const first = pick([msg(1)]);
    const waiting = [msg(1), msg(2, { country: "FR", at: NOW + 500 })];
    expect(ids(pick(waiting, ME, { shown: first.shown, now: NOW + SHOW - 1 }).bubbles)).toEqual(["m1"]);
    expect(ids(pick(waiting, ME, { shown: first.shown, now: NOW + SHOW }).bubbles)).toEqual(["m2"]);
  });

  it("never shows a message twice: once its time is over it stays gone, though it is still in the list", () => {
    const first = pick([msg(1)]);
    expect(first.bubbles).toHaveLength(1);
    const out = pick([msg(1)], ME, { shown: first.shown, now: NOW + DELAY * 4 });
    expect(out.bubbles).toEqual([]);
    expect(out.counts).toEqual([]);
  });

  it("keeps a shown bubble the same while it shows, whatever the list now holds", () => {
    const first = pick([msg(1)]);
    const out = pick([], ME, { shown: first.shown, now: NOW + SHOW - 1 });
    expect(first.bubbles).toHaveLength(1);
    expect(out.bubbles).toEqual(first.bubbles);
  });
});

describe("one bubble a country", () => {
  it("shows the newest message of a country and counts the others of it", () => {
    const messages = many(3, (n) => ({ country: "JP", at: NOW - 1000 * (n + 1) }));
    const out = pick(messages);
    expect(ids(out.bubbles)).toEqual(["m0"]);
    expect(out.counts).toEqual([{ country: "JP", count: 2, far: false }]);
  });

  it("counts a country that has no bubble, and leaves a country with nothing else out of the counts", () => {
    const out = pick(many(RULES.maxOnScreen + 1));
    expect(out.counts).toHaveLength(1);
    expect(out.counts[0]?.count).toBe(1);
    expect(out.bubbles.every((b) => countOf(out.counts, b.country) === 0)).toBe(true);
  });

  it("orders the counts from the largest, then by country code", () => {
    const messages = [
      ...many(4, (n) => ({ id: `a${String(n)}`, account: `a${String(n)}`, country: "JP", at: NOW - 100 * (n + 1) })),
      ...many(3, (n) => ({ id: `b${String(n)}`, account: `b${String(n)}`, country: "FR", at: NOW - 100 * (n + 1) })),
      ...many(3, (n) => ({ id: `c${String(n)}`, account: `c${String(n)}`, country: "DE", at: NOW - 100 * (n + 1) })),
    ];
    expect(pick(messages).counts.map((c) => [c.country, c.count])).toEqual([
      ["JP", 3],
      ["DE", 2],
      ["FR", 2],
    ]);
  });

  it("does not count a message already shown, and counts a later one of its country", () => {
    const first = pick([msg(1, { country: "JP" })]);
    const out = pick([msg(1, { country: "JP" }), msg(2, { country: "JP", at: NOW + 100 })], ME, {
      shown: first.shown,
      now: NOW + 100,
    });
    expect(ids(out.bubbles)).toEqual(["m1"]);
    expect(out.counts).toEqual([{ country: "JP", count: 1, far: false }]);
  });

  it("gives the country its place back when its bubble is over", () => {
    const first = pick([msg(1, { country: "JP" })]);
    const messages = [msg(1, { country: "JP" }), msg(2, { country: "JP", at: NOW + 100 })];
    expect(ids(pick(messages, ME, { shown: first.shown, now: NOW + SHOW }).bubbles)).toEqual(["m2"]);
  });
});

describe("one bubble a speaker every delay", () => {
  const first = (): ReturnType<typeof pick> => pick([msg(1, { account: "ann", country: "JP" })]);
  const second = (at: number): BubbleMessage => msg(2, { account: "ann", country: "FR", at });

  it("refuses the same account 100 ms before the delay is over, and counts the message", () => {
    const out = pick([second(NOW + 100)], ME, { shown: first().shown, now: NOW + DELAY - 100 });
    expect(out.bubbles).toEqual([]);
    expect(out.counts).toEqual([{ country: "FR", count: 1, far: false }]);
  });

  it("takes the same account when the delay is over, to the millisecond", () => {
    const out = pick([second(NOW + 100)], ME, { shown: first().shown, now: NOW + DELAY });
    expect(ids(out.bubbles)).toEqual(["m2"]);
  });

  it("holds when the first bubble is long gone and the delay is not", () => {
    expect(SHOW).toBeLessThan(DELAY);
    expect(first().bubbles).toHaveLength(1);
    const out = pick([second(NOW + SHOW)], ME, { shown: first().shown, now: NOW + SHOW + 1 });
    expect(out.bubbles).toEqual([]);
  });

  it("counts a speaker's accounts by name as Ergo folds it: Ann and ann are one", () => {
    const out = pick([msg(2, { account: "ANN", country: "FR", at: NOW + 100 })], ME, {
      shown: first().shown,
      now: NOW + 1000,
    });
    expect(ids(first().bubbles)).toEqual(["m1"]);
    expect(ids(out.bubbles)).toEqual(["m1"]);
    expect(out.counts).toEqual([{ country: "FR", count: 1, far: false }]);
    expect(
      ids(pick([msg(2, { account: "bob", country: "FR" })], ME, { shown: first().shown, now: NOW + 1000 }).bubbles),
    ).toEqual(["m1", "m2"]);
  });

  it("keys the delay by account: another account of the same text and country is another speaker", () => {
    const out = pick([msg(2, { account: "bob", text: "hello 1", country: "FR" })], ME, {
      shown: first().shown,
      now: NOW + 1000,
    });
    expect(ids(out.bubbles)).toEqual(["m1", "m2"]);
  });

  it("shows one message of a speaker in a call, the newest, and counts the rest", () => {
    const messages = [
      msg(1, { account: "ann", country: "JP", at: NOW - 100 }),
      msg(2, { account: "ann", country: "FR", at: NOW - 200 }),
    ];
    const out = pick(messages);
    expect(ids(out.bubbles)).toEqual(["m1"]);
    expect(out.counts).toEqual([{ country: "FR", count: 1, far: false }]);
  });

  it("forgets a speaker once the delay is over and the message has left the list", () => {
    const shown = first().shown;
    expect(pick([], ME, { shown: shown, now: NOW + DELAY - 1 }).shown.map((s) => s.id)).toEqual(["m1"]);
    expect(pick([], ME, { shown: shown, now: NOW + DELAY }).shown).toEqual([]);
  });

  it("remembers a message still in the list, so it is not shown again once the delay is over", () => {
    const shown = first().shown;
    const out = pick([msg(1, { account: "ann", country: "JP" })], ME, { shown: shown, now: NOW + DELAY * 3 });
    expect(out.shown.map((s) => s.id)).toEqual(["m1"]);
    expect(out.bubbles).toEqual([]);
  });
});

describe("the order", () => {
  it("takes a mention of you, then your hub, then the rest, the newest first in each", () => {
    const viewer: Viewer = { ...ME, hub: "bubble" };
    const messages = [
      ...many(RULES.maxOnScreen, (n) => ({ id: `rest${String(n)}`, account: `rest${String(n)}`, at: NOW - 100 * n })),
      msg(20, { id: "hubOld", hub: "bubble", at: NOW - 9000 }),
      msg(21, { id: "hubNew", hub: "bubble", at: NOW - 8000 }),
      msg(22, { id: "elsewhere", hub: "other", at: NOW - 5000 }),
      msg(23, { id: "mentionOld", hub: "other", mentions: ["me"], at: NOW - 9500 }),
      msg(24, { id: "mentionHub", hub: "bubble", mentions: ["someone", "me"], at: NOW - 9400 }),
    ];
    const out = pick(messages, viewer).bubbles;
    const head = ids(out).slice(0, 4);
    expect(head).toEqual(["mentionHub", "mentionOld", "hubNew", "hubOld"]);
    expect(ids(out).slice(4, 6)).toEqual(["rest0", "rest1"].slice(0, RULES.maxOnScreen - 4));
    expect(out).toHaveLength(RULES.maxOnScreen);
  });

  it("leaves out of the six the older rest when mentions and the hub fill the places", () => {
    const messages = [
      ...many(RULES.maxOnScreen, (n) => ({
        id: `hub${String(n)}`,
        account: `hub${String(n)}`,
        hub: "bubble",
        at: NOW - 5000 - n,
      })),
      msg(30, { id: "new", country: "NZ", at: NOW - 10 }),
    ];
    const out = pick(messages, { ...ME, hub: "bubble" });
    expect(ids(out.bubbles)).toEqual(ids(messages.slice(0, RULES.maxOnScreen)));
    expect(ids(out.bubbles)).not.toContain("new");
  });

  it("reads a mention of you by account, as Ergo folds it, and not a mention of another", () => {
    const messages = [
      msg(1, { id: "other", mentions: ["alice"], at: NOW - 100 }),
      msg(2, { id: "mine", mentions: ["ME"], at: NOW - 9000 }),
    ];
    expect(ids(pick(messages).bubbles)).toEqual(["mine", "other"]);
  });

  it("breaks a tie of time by id, so the same list always gives the same order", () => {
    const messages = [msg(2, { at: NOW - 100 }), msg(1, { at: NOW - 100 })];
    expect(ids(pick(messages).bubbles)).toEqual(["m1", "m2"]);
    expect(ids(pick([...messages].reverse()).bubbles)).toEqual(["m1", "m2"]);
  });

  it("keeps the bubbles already on screen before the new ones", () => {
    const first = pick([msg(1)]);
    const out = pick([msg(1), msg(2, { at: NOW + 100 })], ME, { shown: first.shown, now: NOW + 100 });
    expect(ids(out.bubbles)).toEqual(["m1", "m2"]);
  });
});

describe("your own message", () => {
  const mine = (over: Partial<BubbleMessage> = {}): BubbleMessage =>
    msg(90, { id: "mine", account: "me", country: "JP", at: NOW - 60_000, ...over });

  it("is shown, flagged as yours, though it is the oldest of a full list", () => {
    const out = pick([...many(RULES.maxOnScreen + 3, (n) => ({ country: CODES[n + 1] ?? "FR" })), mine()]);
    expect(ids(out.bubbles)).toContain("mine");
    expect(out.bubbles.find((b) => b.id === "mine")?.own).toBe(true);
    expect(out.bubbles.filter((b) => b.own)).toHaveLength(1);
    expect(out.bubbles).toHaveLength(RULES.maxOnScreen);
  });

  it("is shown within the delay of a bubble of yours that is on screen or not long gone", () => {
    const first = pick([mine({ id: "first", at: NOW })]);
    const out = pick([mine({ id: "again", at: NOW + 500 })], ME, { shown: first.shown, now: NOW + 1000 });
    expect(ids(out.bubbles)).toContain("again");
  });

  it("takes your country's place, and the other bubble of your country goes", () => {
    const first = pick([msg(1, { id: "jp", country: "JP", account: "kenji" })]);
    const out = pick([msg(1, { id: "jp", country: "JP", account: "kenji" }), mine({ at: NOW + 100 })], ME, {
      shown: first.shown,
      now: NOW + 100,
    });
    expect(ids(out.bubbles)).toEqual(["mine"]);
    expect(pick([], ME, { shown: out.shown, now: NOW + 200 }).bubbles.map((b) => b.id)).toEqual(["mine"]);
  });

  it("makes room by taking the oldest bubble's place when the screen is full of other countries", () => {
    const full = pick(many(RULES.maxOnScreen, (n) => ({ country: CODES[n + 1] ?? "FR" })));
    const messages = [...many(RULES.maxOnScreen, (n) => ({ country: CODES[n + 1] ?? "FR" })), mine({ at: NOW + 100 })];
    const out = pick(messages, ME, { shown: full.shown, now: NOW + 100 });
    expect(out.bubbles).toHaveLength(RULES.maxOnScreen);
    expect(ids(out.bubbles)).toContain("mine");
    expect(ids(out.bubbles)).not.toContain(`m${String(RULES.maxOnScreen - 1)}`);
  });

  it("does not come back when the place of your country is free again: the bubble it displaced is not shown twice", () => {
    const kenji = msg(1, { id: "jp", country: "JP", account: "kenji" });
    const first = pick([kenji]);
    const out = pick([kenji, mine({ at: NOW + 100 })], ME, { shown: first.shown, now: NOW + 100 });
    expect(ids(out.bubbles)).toEqual(["mine"]);
    const later = pick([kenji, mine({ at: NOW + 100 })], ME, { shown: out.shown, now: NOW + 100 + SHOW });
    expect(later.bubbles).toEqual([]);
    expect(later.counts).toEqual([]);
  });

  it("holds your country's place: nobody else of it is shown while yours is", () => {
    const first = pick([mine({ at: NOW })]);
    const out = pick([msg(2, { country: "JP", at: NOW + 500 })], ME, { shown: first.shown, now: NOW + 1000 });
    expect(ids(out.bubbles)).toEqual(["mine"]);
    expect(out.counts).toEqual([{ country: "JP", count: 1, far: false }]);
  });

  it("shows the newest of two of yours in a call, and counts the older one of the same country", () => {
    const out = pick([mine({ id: "old", at: NOW - 9000 }), mine({ id: "new", at: NOW - 100 })]);
    expect(ids(out.bubbles)).toEqual(["new"]);
    expect(out.counts).toEqual([{ country: "JP", count: 1, far: false }]);
  });

  it("is cut at maxChars like any other", () => {
    const out = pick([mine({ text: "x".repeat(RULES.maxChars + 20) })]);
    expect(out.bubbles[0]?.text).toBe("x".repeat(RULES.maxChars));
  });

  it("is never shown without a declared country, in a private room or a direct message, or once hidden", () => {
    expect(ids(pick([mine()]).bubbles)).toEqual(["mine"]);
    for (const m of [
      noCountry(mine()),
      mine({ visibility: "private" }),
      mine({ visibility: "dm" }),
      mine({ joined: false }),
      mine({ hidden: true }),
    ])
      expect(pick([m]).bubbles).toEqual([]);
  });

  it("is the viewer's account, as Ergo folds it", () => {
    expect(pick([mine({ account: "ME" })]).bubbles[0]?.own).toBe(true);
  });
});

describe("what is never picked", () => {
  const dropped = (over: Partial<BubbleMessage>, viewer: Viewer = ME): void => {
    const out = pick([msg(1, { country: "JP", ...over }), msg(2, { country: "JP", at: NOW - 5000 })], viewer);
    expect(ids(out.bubbles)).toEqual(["m2"]);
    expect(out.counts).toEqual([]);
  };

  it("drops a message of a private room, of a direct message and of a room not joined", () => {
    dropped({ visibility: "private" });
    dropped({ visibility: "dm" });
    dropped({ joined: false });
  });

  it("drops any visibility but the public one, whatever the data says", () => {
    dropped({ visibility: "secret" as BubbleMessage["visibility"] });
    dropped({ visibility: undefined as unknown as BubbleMessage["visibility"] });
  });

  it("drops a message the moderation bot hid: not shown, not counted, and it holds no place", () => {
    dropped({ hidden: true });
  });

  it("shows a message that is not hidden, whether the flag is false or absent", () => {
    expect(ids(pick([msg(1, { hidden: false })]).bubbles)).toEqual(["m1"]);
  });

  it("drops a muted account, as Ergo folds it, before any rule: no bubble, no count, no place", () => {
    dropped({ account: "troll" }, { ...ME, muted: ["troll"] });
    dropped({ account: "Troll" }, { ...ME, muted: ["TROLL"] });
  });

  it("drops a banned account the same way", () => {
    dropped({ account: "troll" }, { ...ME, banned: ["troll"] });
    dropped({ account: "TROLL" }, { ...ME, banned: ["troll"] });
  });

  it("drops a muted account even when it mentions you", () => {
    dropped({ account: "troll", mentions: ["me"] }, { ...ME, muted: ["troll"] });
  });

  it("drops a message with no declared country: it is not shown, not counted, and its country is not guessed", () => {
    const out = pick([noCountry(msg(1)), msg(2, { country: "JP" })]);
    expect(ids(out.bubbles)).toEqual(["m2"]);
    expect(out.counts).toEqual([]);
  });

  it.each(["", "jp", "JPN", "J", "J1", " JP", "JP ", "<>", "Jp"])(
    "drops the country %j: only two capitals are a code",
    (country) => {
      dropped({ country });
    },
  );

  it("drops a bubble that was shown to a muted account later: the viewer muting hides it at once", () => {
    const first = pick([msg(1, { account: "troll" })]);
    expect(first.bubbles).toHaveLength(1);
    const out = pick(
      [msg(1, { account: "troll" })],
      { ...ME, muted: ["troll"] },
      { shown: first.shown, now: NOW + 1000 },
    );
    expect(out.bubbles).toEqual([]);
  });

  it("drops a bubble whose line was hidden after it was shown", () => {
    const first = pick([msg(1)]);
    expect(first.bubbles).toHaveLength(1);
    const out = pick([msg(1, { hidden: true })], ME, { shown: first.shown, now: NOW + 1000 });
    expect(out.bubbles).toEqual([]);
  });
});

describe("the text", () => {
  it("is plain text cut like cutText, and links stay text", () => {
    const text = `<script>x</script> https://evil.test/${"a".repeat(200)}‮`;
    expect(pick([msg(1, { text })]).bubbles[0]?.text).toBe(cutText(text, RULES.maxChars));
  });

  it("drops a message whose text is blank once it is cleaned: nothing to say", () => {
    const out = pick([msg(1, { text: "\u200b\u202e\n" }), msg(2, { country: "JP", at: NOW - 5000 })]);
    expect(ids(out.bubbles)).toEqual(["m2"]);
    expect(out.counts).toEqual([]);
  });

  it("drops a message of joiners alone: an invisible bubble would take a country's place and a speaker's delay (finding 2)", () => {
    const out = pick([
      msg(1, { text: "\u200d\u200d\u200d", account: "ann" }),
      msg(2, { country: "JP", at: NOW - 5000 }),
    ]);
    expect(ids(out.bubbles)).toEqual(["m2"]);
    expect(out.counts).toEqual([]);
    expect(out.shown.map((s) => s.id)).toEqual(["m2"]);
  });

  it("joins nothing between letters, and cleans a lone surrogate (findings 2 and 8)", () => {
    expect(pick([msg(1, { text: "a\u200db\ud800c" })]).bubbles[0]?.text).toBe("abc");
  });
});

describe("hostile accounts and a repeated message", () => {
  const NAMES = ["__proto__", "constructor", "toString", "hasOwnProperty", "valueOf"];

  it.each(NAMES)("keeps the speaker delay of the account %s like any other (finding 4)", (account) => {
    const first = pick([msg(1, { account, country: "JP" })]);
    expect(ids(first.bubbles)).toEqual(["m1"]);
    const second = msg(2, { account, country: "FR", at: NOW + 100 });
    const early = pick([second], ME, { shown: first.shown, now: NOW + DELAY - 1 });
    expect(ids(early.bubbles)).not.toContain("m2");
    expect(early.counts).toEqual([{ country: "FR", count: 1, far: false }]);
    expect(ids(pick([second], ME, { shown: first.shown, now: NOW + DELAY }).bubbles)).toEqual(["m2"]);
  });

  it.each(NAMES)("drops a muted and a banned account named %s (finding 4)", (account) => {
    for (const viewer of [
      { ...ME, muted: [account] },
      { ...ME, banned: [account] },
    ]) {
      const out = pick([msg(1, { account }), msg(2, { country: "JP", at: NOW - 5000 })], viewer);
      expect(ids(out.bubbles)).toEqual(["m2"]);
      expect(out.counts).toEqual([]);
    }
  });

  it("does not take another account for a muted __proto__ one", () => {
    expect(ids(pick([msg(1, { account: "ann" })], { ...ME, muted: ["__proto__"] }).bubbles)).toEqual(["m1"]);
  });

  it("shows a message once and counts it zero times when the list holds it twice (finding 5)", () => {
    const out = pick([msg(1, { country: "JP" }), msg(1, { country: "JP" })]);
    expect(ids(out.bubbles)).toEqual(["m1"]);
    expect(out.counts).toEqual([]);
    const mine = msg(2, { id: "mine", account: "me", country: "FR" });
    const own = pick([mine, mine]);
    expect(ids(own.bubbles)).toEqual(["mine"]);
    expect(own.counts).toEqual([]);
  });

  it("reads the newest copy of a repeated id, whatever the order of the list", () => {
    const old = msg(1, { at: NOW - 9000, text: "old" });
    const recent = msg(1, { at: NOW - 100, text: "recent" });
    expect(pick([old, recent]).bubbles[0]?.text).toBe("recent");
    expect(pick([recent, old]).bubbles[0]?.text).toBe("recent");
  });
});

describe("a clock that steps back (finding 6)", () => {
  const BACK = NOW - 3_600_000;
  const first = (): ReturnType<typeof pick> => pick([msg(1, { account: "ann", country: "JP" })]);
  /** The state after the first call that sees the clock gone back, which is the one the next calls are given. */
  const stepped = (): readonly Bubble[] => pick([], ME, { shown: first().shown, now: BACK }).shown;

  it("shows a bubble of the future for the show time from now at most, not for the step", () => {
    const out = pick([], ME, { shown: first().shown, now: BACK });
    expect(out.bubbles).toHaveLength(1);
    expect(out.bubbles[0]?.until).toBeLessThanOrEqual(BACK + SHOW);
    expect(pick([], ME, { shown: out.shown, now: BACK + SHOW }).bubbles).toEqual([]);
  });

  it("gives its country's place back with it, not an hour later", () => {
    const later = msg(2, { country: "JP", at: BACK + 10 });
    expect(ids(pick([later], ME, { shown: stepped(), now: BACK + 1 }).bubbles)).toEqual(["m1"]);
    expect(ids(pick([later], ME, { shown: stepped(), now: BACK + SHOW }).bubbles)).toEqual(["m2"]);
  });

  it("counts its speaker's delay from the step back, so the speaker waits the delay and no more", () => {
    const again = msg(2, { account: "ann", country: "FR", at: BACK + 10 });
    expect(ids(pick([again], ME, { shown: stepped(), now: BACK + DELAY - 1 }).bubbles)).not.toContain("m2");
    expect(ids(pick([again], ME, { shown: stepped(), now: BACK + DELAY }).bubbles)).toContain("m2");
  });
});

describe("how much it reads", () => {
  const crowd = (count: number): BubbleMessage[] =>
    Array.from({ length: count }, (_, n) => msg(n, { country: "JP", at: NOW - 1000 - n, account: `p${String(n)}` }));

  it("reads the newest readLast messages: the one before them changes nothing", () => {
    const window = crowd(RULES.readLast);
    const older = msg(9999, { id: "ancient", country: "FR", at: NOW - 250_000, account: "old" });
    expect(pick([...window, older])).toEqual(pick(window));
    expect(pick([...window, older]).counts.map((c) => c.country)).toEqual(["JP"]);
  });

  it("reads the oldest one still inside the window", () => {
    const window = [
      ...crowd(RULES.readLast - 1),
      msg(9999, { id: "edge", country: "FR", at: NOW - 250_000, account: "old" }),
    ];
    expect(ids(pick(window).bubbles)).toContain("edge");
  });

  it("breaks a tie of time by id when the window clips, whatever the order of the list (finding 7)", () => {
    const rules: Rules = { ...RULES, readLast: 3 };
    const burst = Array.from({ length: 5 }, (_, n) => msg(n, { at: NOW - 1000 }));
    const one = pickBubbles(burst, NOW, ME, rules, []);
    expect(ids(one.bubbles)).toEqual(["m0", "m1", "m2"]);
    expect(one.counts).toEqual([]);
    expect(pickBubbles([...burst].reverse(), NOW, ME, rules, [])).toEqual(one);
    expect(
      pickBubbles(
        [burst[3], burst[0], burst[4], burst[2], burst[1]].flatMap((m) => (m ? [m] : [])),
        NOW,
        ME,
        rules,
        [],
      ),
    ).toEqual(one);
  });

  it("counts only what it read", () => {
    const out = pick(crowd(RULES.readLast + 50));
    expect(countOf(out.counts, "JP")).toBe(RULES.readLast - 1);
  });
});

describe("it is a function", () => {
  const freeze = <T>(value: T): T => {
    if (typeof value === "object" && value !== null) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };

  it("gives the same answer to the same input, and changes nothing it was given", () => {
    const messages = freeze(many(20, (n) => ({ mentions: n % 3 === 0 ? ["me"] : [] })));
    const viewer = freeze({ ...ME, hub: "bubble", muted: ["acct4"], banned: ["acct5"] });
    const rules = freeze({ ...RULES });
    const shown = freeze(pick(many(3)).shown);
    const one = pickBubbles(messages, NOW + 1000, viewer, rules, shown);
    const two = pickBubbles(messages, NOW + 1000, viewer, rules, shown);
    expect(two).toEqual(one);
    expect(one.bubbles.length).toBeGreaterThan(0);
  });

  it("reads no clock and no chance: time is the parameter", () => {
    vi.spyOn(Date, "now").mockImplementation(() => {
      throw new Error("the clock");
    });
    vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("chance");
    });
    expect(pick(many(20)).bubbles).toHaveLength(RULES.maxOnScreen);
  });

  it("does not depend on the order of the list", () => {
    const messages = many(20, (n) => ({ country: CODES[n % 7] ?? "JP", mentions: n % 4 === 0 ? ["me"] : [] }));
    const reversed = [...messages].reverse();
    expect(pick(reversed)).toEqual(pick(messages));
    expect(pick(messages).bubbles.length).toBeGreaterThan(0);
  });

  it("returns the rules' own cut: a rule of maxChars moves the cut, nothing else does", () => {
    const text = "y".repeat(100);
    const out = pickBubbles([msg(1, { text })], NOW, ME, { ...RULES, maxChars: 30 }, []);
    expect(out.bubbles[0]?.text).toBe("y".repeat(30));
  });

  it("reads maxOnScreen, showSeconds, speakerDelaySeconds and readLast from the rules it is given", () => {
    const rules: Rules = { maxOnScreen: 2, showSeconds: 2, speakerDelaySeconds: 3, maxChars: 40, readLast: 3 };
    const messages = many(10);
    const out = pickBubbles(messages, NOW, ME, rules, []);
    expect(ids(out.bubbles)).toEqual(["m0", "m1"]);
    expect(out.counts.map((c) => c.count)).toEqual([1]);
    expect(pickBubbles(messages, NOW + 1999, ME, rules, out.shown).bubbles).toHaveLength(2);
    expect(ids(pickBubbles(messages, NOW + 2000, ME, rules, out.shown).bubbles)).toEqual(["m2"]);
    expect(pickBubbles([], NOW + 2999, ME, rules, out.shown).shown).toHaveLength(2);
    expect(pickBubbles([], NOW + 3000, ME, rules, out.shown).shown).toHaveLength(0);
  });
});

describe("for any input (property)", () => {
  const others = ["ann", "bob", "cy", "dee", "eve"];
  const speakers = [...others, "me"];
  const message = fc.record(
    {
      id: fc.uuid(),
      at: fc.integer({ min: NOW - 120_000, max: NOW + 60_000 }),
      account: fc.constantFrom(...speakers, "ANN", "Bob"),
      text: fc.string({ unit: "grapheme", maxLength: 400 }),
      country: fc.oneof(fc.constantFrom(...CODES), fc.constantFrom("jp", "", "XYZ")),
      visibility: fc.constantFrom("public", "public", "public", "private", "dm"),
      joined: fc.boolean(),
      hub: fc.constantFrom("bubble", "other"),
      mentions: fc.array(fc.constantFrom("me", "ann"), { maxLength: 2 }),
      hidden: fc.boolean(),
    },
    { requiredKeys: ["id", "at", "account", "text", "visibility", "joined"] },
  ) as fc.Arbitrary<BubbleMessage>;
  const viewer = fc.record({
    account: fc.constant("me"),
    hub: fc.constantFrom("bubble", "other"),
    muted: fc.subarray(others),
    banned: fc.subarray(others),
  }) as fc.Arbitrary<Viewer>;
  /** A message nothing in the rules refuses, at the first step (an empty state): one at least must then be shown. */
  const open = (m: BubbleMessage): boolean => m.visibility === "public" && m.joined && m.hidden !== true;
  const eligible = (m: BubbleMessage, who: Viewer): boolean =>
    open(m) &&
    m.country !== undefined &&
    CODES.includes(m.country) &&
    cutText(m.text, RULES.maxChars).trim().length > 0 &&
    ![...who.muted, ...who.banned].some((a) => a.toLowerCase() === m.account.toLowerCase());
  const steps = Array.from({ length: 45 }, (_, k) => NOW + k * 1000);

  const shownIfAny = (messages: readonly BubbleMessage[], who: Viewer, bubbles: readonly Bubble[]): boolean =>
    bubbles.length > 0 || !messages.some((m) => eligible(m, who));

  /** What a bubble on screen must be: of a public, joined, visible line of an account the viewer did not mute or ban. */
  function checkBubble(b: Bubble, source: BubbleMessage | undefined, who: Viewer): void {
    expect(graphemes(b.text)).toBeLessThanOrEqual(RULES.maxChars);
    if (source === undefined) return;
    expect(open(source)).toBe(true);
    const account = source.account.toLowerCase();
    expect(who.muted.map((a) => a.toLowerCase())).not.toContain(account);
    expect(who.banned.map((a) => a.toLowerCase())).not.toContain(account);
  }

  /** The times each speaker but the viewer began a bubble, each bubble once, by account. */
  function startsOf(everShown: Map<string, Bubble>, who: Viewer): number[][] {
    const by = new Map<string, number[]>();
    for (const s of everShown.values()) {
      const account = s.account.toLowerCase();
      if (account !== who.account)
        by.set(
          account,
          [...(by.get(account) ?? []), s.since].sort((x, y) => x - y),
        );
    }
    return [...by.values()];
  }

  it("never breaks a cap, a place or a rule, and never shows what is private, hidden or muted", () => {
    fc.assert(
      fc.property(fc.array(message, { maxLength: 60 }), viewer, (messages, who) => {
        const byId = new Map(messages.map((m) => [m.id, m]));
        let shown: readonly Bubble[] = [];
        const everShown = new Map<string, Bubble>();
        for (const now of steps) {
          const out = pickBubbles(messages, now, who, RULES, shown);
          if (now === NOW) expect(shownIfAny(messages, who, out.bubbles)).toBe(true);
          expect(out.bubbles.length).toBeLessThanOrEqual(RULES.maxOnScreen);
          const countries = out.bubbles.map((b) => b.country);
          expect(new Set(countries).size).toBe(countries.length);
          for (const b of out.bubbles) {
            expect(b.until).toBeGreaterThan(now);
            checkBubble(b, byId.get(b.id), who);
          }
          for (const s of out.shown) if (!everShown.has(s.id)) everShown.set(s.id, s);
          shown = out.shown;
        }
        for (const times of startsOf(everShown, who))
          for (let i = 1; i < times.length; i++)
            expect((times[i] ?? 0) - (times[i - 1] ?? 0)).toBeGreaterThanOrEqual(DELAY);
      }),
      { numRuns: 60 },
    );
  });

  it("counts only what it did not show, never a country twice, never a dropped message", () => {
    fc.assert(
      fc.property(fc.array(message, { maxLength: 60 }), viewer, (messages, who) => {
        const out = pickBubbles(messages, NOW + 5000, who, RULES, []);
        const names = out.counts.map((c) => c.country);
        expect(new Set(names).size).toBe(names.length);
        for (const c of out.counts) {
          expect(c.count).toBeGreaterThan(0);
          expect(CODES).toContain(c.country);
        }
        const listed = messages.filter((m) => open(m) && m.country !== undefined && CODES.includes(m.country));
        const total = out.counts.reduce((sum, c) => sum + c.count, 0);
        expect(total + out.bubbles.length).toBeLessThanOrEqual(listed.length);
      }),
      { numRuns: 60 },
    );
  });

  it("keeps in its state only what is shown, or in the list, or inside the delay", () => {
    fc.assert(
      fc.property(fc.array(message, { maxLength: 40 }), (messages) => {
        let shown: readonly Bubble[] = [];
        for (const now of steps) {
          const out = pickBubbles(messages, now, ME, RULES, shown);
          const listed = new Set(messages.map((m) => m.id));
          for (const s of out.shown) expect(listed.has(s.id) || now - s.since < DELAY).toBe(true);
          shown = out.shown;
        }
      }),
      { numRuns: 40 },
    );
  });

  it("gives the same answer twice, and the same for a list in any order (determinism)", () => {
    fc.assert(
      fc.property(fc.array(message, { maxLength: 40 }), viewer, fc.integer({ min: 0, max: 40 }), (messages, who, k) => {
        const unique = [...new Map(messages.map((m) => [m.id, m])).values()];
        const one = pickBubbles(unique, NOW + k * 1000, who, RULES, []);
        if (unique.some((m) => eligible(m, who))) expect(one.bubbles.length).toBeGreaterThan(0);
        expect(pickBubbles(unique, NOW + k * 1000, who, RULES, [])).toEqual(one);
        expect(pickBubbles([...unique].reverse(), NOW + k * 1000, who, RULES, [])).toEqual(one);
      }),
      { numRuns: 60 },
    );
  });
});
