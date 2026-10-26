import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { escapeTagValue, parseLine, type IrcMessage } from "../irc/irc.ts";
import { addReactions, reactionLine, reactionOf, reactionsOn, redactReactions, type Reaction } from "./reactions.ts";

const ME = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const T0 = "2026-10-25T10:00:00.000Z";
// The same seed and runs as irc.test.ts, so the gate never flaps on a property.
const PROPERTY = { seed: 20261017, numRuns: 300 };
const read = (line: string): IrcMessage => {
  const parsed = parseLine(line);
  if (!parsed.ok) throw new Error(`the test's line does not parse: ${line}`);
  return parsed.message;
};
// A TAGMSG to #bubble, as Ergo relays it: its msgid, its time, the account Ergo vouches for, then `tags`.
const tagmsg = (tags: string, { id = "r1", time = T0, account = ALICE, room = "#bubble" } = {}) =>
  read(`@msgid=${id};time=${time};account=${account};${tags} :${account || "nick"}!u@h TAGMSG ${room}`);
const reaction = (over: Partial<Reaction> = {}): Reaction => ({
  id: "r1",
  time: T0,
  to: "m1",
  emoji: "👍",
  who: ALICE,
  on: true,
  ...over,
});
// The nth second after T0.
const second = (n: number) => new Date(Date.parse(T0) + n * 1000).toISOString();
const frozen = <T>(list: T[]): readonly T[] => Object.freeze([...list]);

// 4d: a reaction is a TAGMSG naming the line it answers (draft/react; Ergo stores it: ircd.yaml.tmpl's tagmsg-storage).
// It comes from anyone in the room, so each part is checked by hand (docs/decisions.md, 2026-10-26): one emoji of
// RGI's set, a msgid of one word a tag may carry, an account Ergo vouches for.
describe("reactionOf: a reaction from Ergo's TAGMSG", () => {
  test("reads a reaction: its msgid, time, the line it answers, its emoji, its account, added", () => {
    expect(reactionOf(tagmsg("+draft/react=👍;+reply=m1"), "#bubble")).toEqual(reaction());
  });

  test("reads a reaction taken back, +draft/unreact", () => {
    expect(reactionOf(tagmsg("+draft/unreact=👍;+reply=m1"), "#bubble")).toEqual(reaction({ on: false }));
  });

  test("reads +react as a reaction and +draft/reply as the line it answers", () => {
    expect(reactionOf(tagmsg("+react=👍;+draft/reply=m1"), "#bubble")).toEqual(reaction());
  });

  test("reads the room whatever its case", () => {
    expect(reactionOf(tagmsg("+draft/react=👍;+reply=m1", { room: "#Bubble" }), "#bubble")).toEqual(reaction());
  });

  // Each name read in its order, the first that holds a value of its kind winning (R14).
  test.each([
    ["+draft/react before +react", "+draft/react=👍;+react=😂;+reply=m1", { emoji: "👍" }],
    ["+react when +draft/react holds no emoji", "+draft/react=nice;+react=😂;+reply=m1", { emoji: "😂" }],
    ["+reply before +draft/reply", "+draft/react=👍;+reply=m1;+draft/reply=m2", { to: "m1" }],
    ["+draft/reply when +reply holds no msgid", String.raw`+draft/react=👍;+reply=m\s1;+draft/reply=m2`, { to: "m2" }],
  ])("reads %s", (_, tags, over) => {
    expect(reactionOf(tagmsg(tags), "#bubble")).toEqual(reaction(over));
  });

  // Emoji are sequences: a selector, a skin tone, a ZWJ family or couple, a flag's letters, a subdivision's tags, a
  // keycap (R9).
  test.each(["❤️", "☺️", "👍🏽", "🏳️‍🌈", "👩‍👩‍👧‍👦", "👩🏻‍❤️‍💋‍👨🏿", "🧑‍🦰", "🇫🇷", "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "1️⃣", "😂"])("reads the emoji %s whole", (emoji) => {
    expect(reactionOf(tagmsg(`+draft/react=${escapeTagValue(emoji)};+reply=m1`), "#bubble")?.emoji).toBe(emoji);
  });

  test.each([
    ["words", "nice"],
    ["two emoji", "👍👍"],
    ["an emoji and a space", "👍 "],
    ["an emoji and a letter", "👍a"],
    ["nothing", ""],
    ["a flag's lone letter", "🇦"],
    ["a heart in its text form, which RGI's set lists only with its emoji selector", "❤"],
    ["a smile in its text form, its text selector", "☺︎"],
    ["two emoji joined by a ZWJ into no sequence of RGI's", "👍‍😂"],
    ["a skin tone on an emoji that takes none", "🙂🏽"],
    ["an emoji under a combining accent", "👍́"],
    ["a digit", "1"],
    ["300 emoji", "👍".repeat(300)],
  ])("reads no reaction of %s", (_, value) => {
    expect(reactionOf(tagmsg(`+draft/react=${escapeTagValue(value)};+reply=m1`), "#bubble")).toBeUndefined();
  });

  // The msgid a reaction answers: one word a tag may carry back, of 64 characters at most (R14).
  test.each([
    ["nothing", ""],
    ["a space", "m 1"],
    ["a leading colon", ":m1"],
    ["a semicolon", "m;1"],
    ["a backslash", "m\\1"],
    ["a leading space", " m1"],
    ["a leading semicolon", ";m1"],
    ["a leading backslash", "\\m1"],
    ["a leading comma", ",m1"],
    ["a tab", "m\t1"],
    ["a leading tab", "\tm1"],
    ["a CR", "m\r1"],
    ["a leading CR", "\rm1"],
    ["an LF", "m\n1"],
    ["a leading LF", "\nm1"],
    ["a comma", "m1,m2"],
    ["65 characters", "m".repeat(65)],
  ])("reads no reaction to a msgid holding %s", (_, to) => {
    expect(reactionOf(tagmsg(`+draft/react=👍;+reply=${escapeTagValue(to)}`), "#bubble")).toBeUndefined();
  });

  test("reads a reaction to a msgid of 64 characters", () => {
    expect(reactionOf(tagmsg(`+draft/react=👍;+reply=${"m".repeat(64)}`), "#bubble")?.to).toBe("m".repeat(64));
  });

  test.each([
    ["an add and a take-back at once", tagmsg("+draft/react=👍;+draft/unreact=👍;+reply=m1")],
    ["no line it answers", tagmsg("+draft/react=👍")],
    ["typing, which is no reaction", tagmsg("+typing=active")],
    ["an empty account", tagmsg("+draft/react=👍;+reply=m1", { account: "" })],
    ["another room's", tagmsg("+draft/react=👍;+reply=m1", { room: "#garden" })],
    [
      "a guest's, with no account",
      read(`@msgid=r1;time=${T0};+draft/react=👍;+reply=m1 :guest-ab12cd!u@h TAGMSG #bubble`),
    ],
    ["one with no msgid", read(`@time=${T0};account=${ALICE};+draft/react=👍;+reply=m1 :a!u@h TAGMSG #bubble`)],
    ["one with no time", read(`@msgid=r1;account=${ALICE};+draft/react=👍;+reply=m1 :a!u@h TAGMSG #bubble`)],
    ["a PRIVMSG", read(`@msgid=r1;time=${T0};account=${ALICE};+draft/react=👍;+reply=m1 :a!u@h PRIVMSG #bubble :x`)],
    ["a TAGMSG with no room", read(`@msgid=r1;time=${T0};account=${ALICE};+draft/react=👍;+reply=m1 :a!u@h TAGMSG`)],
  ])("reads no reaction from %s", (_, message) => {
    expect(reactionOf(message, "#bubble")).toBeUndefined();
  });

  test("never throws, and reads one whole emoji or none, whatever the value", () => {
    fc.assert(
      fc.property(
        fc.string({ unit: "grapheme", maxLength: 40 }).filter((value) => !value.includes("\0")),
        (value) => {
          const got = reactionOf(tagmsg(`+draft/react=${escapeTagValue(value)};+reply=m1`), "#bubble");
          expect(got === undefined || got.emoji === value).toBe(true);
          if (got !== undefined) expect([...new Intl.Segmenter().segment(got.emoji)]).toHaveLength(1);
        },
      ),
      PROPERTY,
    );
  });
});

// A room keeps one reaction an account, a line and an emoji: the newest, added or taken back (R2), so an account
// repeating itself evicts no one else's; then the newest `cap` of those, in time order.
// The green pass (G2, G3): what the page sends, built in core: one RGI emoji, a msgid a tag carries back, or nothing.
describe("reactionLine: the TAGMSG that adds or takes back a reaction", () => {
  test("adds a reaction, and takes one back, labelled, to the msgid it answers", () => {
    expect(reactionLine({ to: "m1", emoji: "👍", on: true }, "#bubble", "r1")).toBe(
      "@label=r1;+draft/react=👍;+reply=m1 TAGMSG #bubble",
    );
    expect(reactionLine({ to: "m".repeat(64), emoji: "😂", on: false }, "#bubble", "r2")).toBe(
      `@label=r2;+draft/unreact=😂;+reply=${"m".repeat(64)} TAGMSG #bubble`,
    );
  });

  test.each([
    ["a second tag", "👍;+typing=active"],
    ["a space", "👍 "],
    ["a CR LF and a command", "👍\r\nQUIT"],
    ["words", "nice"],
  ])("sends nothing for an emoji holding %s", (_, emoji) => {
    expect(reactionLine({ to: "m1", emoji, on: true }, "#bubble", "r1")).toBeUndefined();
  });

  test.each([
    ["nothing", ""],
    ["a space", "m 1"],
    ["a leading space", " m1"],
    ["a semicolon and a second tag", "m;+typing=active"],
    ["a leading semicolon", ";m1"],
    ["a backslash", "m\\1"],
    ["a leading backslash", "\\m1"],
    ["a comma", "m,1"],
    ["a leading comma", ",m1"],
    ["a leading colon", ":m1"],
    ["a tab", "m\t1"],
    ["a CR LF and a command", "m\r\nQUIT"],
    ["an LF", "m\n1"],
    ["65 characters", "m".repeat(65)],
  ])("sends nothing for a msgid holding %s", (_, to) => {
    expect(reactionLine({ to, emoji: "👍", on: true }, "#bubble", "r1")).toBeUndefined();
  });
});

describe("addReactions: a room's reactions, the newest of each, in time order, the newest kept", () => {
  test("keeps reactions in time order, then by msgid, whatever order they come in", () => {
    const [late, early, tie] = [
      reaction({ id: "b", time: second(1), who: "b" }),
      reaction({ id: "c", time: T0, who: "c" }),
      reaction({ id: "a", time: T0, who: "a" }),
    ];
    expect(addReactions([], [late, early, tie], 10).map(({ id }) => id)).toEqual(["a", "c", "b"]);
  });

  test("keeps each msgid once, a page brought again included", () => {
    const held = frozen([reaction({ id: "a" })]);
    expect(addReactions(held, [reaction({ id: "a" }), reaction({ id: "a" })], 10)).toBe(held);
  });

  test("keeps the newest reaction of an account to a line with an emoji, a take-back included", () => {
    const kept = addReactions([], [reaction({ id: "a" }), reaction({ id: "b", time: second(1), on: false })], 10);
    expect(kept.map(({ id }) => id)).toEqual(["b"]);
  });

  test("keeps the newer when an older one of the same account, line and emoji comes after it", () => {
    const held = frozen([reaction({ id: "b", time: second(1), on: false })]);
    expect(addReactions(held, [reaction({ id: "a", time: T0 })], 10)).toBe(held);
  });

  test("keeps an account's reactions to another line, or with another emoji, apart", () => {
    const kept = addReactions(
      [],
      [reaction({ id: "a" }), reaction({ id: "b", to: "m2" }), reaction({ id: "c", emoji: "😂" })],
      10,
    );
    expect(kept.map(({ id }) => id)).toEqual(["a", "b", "c"]);
  });

  test("lets no account's repeated reaction evict another's older one", () => {
    const other = reaction({ id: "other", who: ME, time: T0 });
    const flood = Array.from({ length: 10_000 }, (_, n) => reaction({ id: `f${String(n)}`, time: second(n + 1) }));
    const kept = addReactions(addReactions([], [other], 1000), flood, 1000);
    expect(kept.map(({ id }) => id)).toEqual(["other", "f9999"]);
  });

  test("keeps the newest `cap` distinct reactions, the newest run of them", () => {
    const many = Array.from({ length: 1200 }, (_, n) =>
      reaction({ id: `r${String(n)}`, time: second(n), who: `a${String(n)}` }),
    );
    const kept = addReactions([], many, 1000);
    expect(kept).toHaveLength(1000);
    expect(kept[0]?.id).toBe("r200");
    expect(kept.at(-1)?.id).toBe("r1199");
  });

  // The green pass (G3): a full window still takes a newer reaction, its oldest let go.
  test("takes a newer reaction into a full window, letting its oldest go", () => {
    const held = frozen([
      reaction({ id: "a", time: second(1), who: "a" }),
      reaction({ id: "b", time: second(2), who: "b" }),
    ]);
    const kept = addReactions(held, [reaction({ id: "c", time: second(3), who: "c" })], 2);
    expect(kept).not.toBe(held);
    expect(kept.map(({ id }) => id)).toEqual(["b", "c"]);
  });

  test("gives back the same array when nothing new came, or what came is older than all it keeps", () => {
    const held = frozen([reaction({ id: "b", time: second(1), who: "b" })]);
    expect(addReactions(held, [], 1)).toBe(held);
    expect(addReactions(held, [reaction({ id: "a", time: T0, who: "a" })], 1)).toBe(held);
  });

  test.each([0, -1, 1.5, Number.NaN])("refuses a cap of %s", (cap) => {
    expect(() => addReactions([], [], cap)).toThrow(RangeError);
  });
});

describe("redactReactions: a reaction hidden by moderation or taken back by REDACT", () => {
  test("drops the reaction a REDACT of the room names", () => {
    const held = frozen([reaction({ id: "a" }), reaction({ id: "b", who: ME })]);
    expect(redactReactions(held, read(":gnoworld!u@h REDACT #Bubble a"), "#bubble").map(({ id }) => id)).toEqual(["b"]);
  });

  test.each([
    ["another room's REDACT", ":gnoworld!u@h REDACT #garden a"],
    ["a REDACT of an id it does not hold", ":gnoworld!u@h REDACT #bubble z"],
    ["a line", `@msgid=z;time=${T0} :a!u@h PRIVMSG #bubble :a`],
  ])("gives back the same array for %s", (_, text) => {
    const held = frozen([reaction({ id: "a" })]);
    expect(redactReactions(held, read(text), "#bubble")).toBe(held);
  });
});

describe("reactionsOn: what each line shows of its reactions", () => {
  // reactionsOn reads no msgid of a reaction: each here keeps reaction()'s.
  const on = (to: string, emoji: string, who: string) => reaction({ to, emoji, who });
  const off = (to: string, emoji: string, who: string) => reaction({ to, emoji, who, on: false });

  test("counts each emoji on a line once an account, mine said, in the order first reacted", () => {
    const shown = reactionsOn([on("m1", "❤️", ALICE), on("m1", "👍", ME), on("m1", "❤️", ME)], ME);
    expect(shown.get("m1")).toEqual([
      { emoji: "❤️", count: 2, mine: true },
      { emoji: "👍", count: 1, mine: true },
    ]);
  });

  // The green pass (G1): mine whoever reacted after me with it.
  test("keeps an emoji mine when another account reacts with it after me", () => {
    expect(reactionsOn([on("m1", "👍", ME), on("m1", "👍", ALICE)], ME).get("m1")).toEqual([
      { emoji: "👍", count: 2, mine: true },
    ]);
  });

  test("counts no take-back, and keeps no emoji whose every reaction was taken back", () => {
    const shown = reactionsOn([on("m1", "👍", ALICE), off("m1", "😂", ME), on("m1", "😂", ALICE)], ME);
    expect(shown.get("m1")).toEqual([
      { emoji: "👍", count: 1, mine: false },
      { emoji: "😂", count: 1, mine: false },
    ]);
    expect(reactionsOn([off("m2", "👍", ALICE)], ME).size).toBe(0);
  });

  test("keeps each line's reactions apart", () => {
    const shown = reactionsOn([on("m1", "👍", ALICE), on("m2", "😂", ALICE)], ME);
    expect(shown.get("m1")).toEqual([{ emoji: "👍", count: 1, mine: false }]);
    expect(shown.get("m2")).toEqual([{ emoji: "😂", count: 1, mine: false }]);
  });

  test("reads any msgid as a line's, an object's own names included", () => {
    const shown = reactionsOn([on("__proto__", "👍", ALICE), on("constructor", "😂", ALICE)], ME);
    expect(shown.get("__proto__")).toEqual([{ emoji: "👍", count: 1, mine: false }]);
    expect(shown.get("constructor")).toEqual([{ emoji: "😂", count: 1, mine: false }]);
    expect(shown.get("toString")).toBeUndefined();
  });

  test("says none is mine for a guest, who has no account", () => {
    expect(reactionsOn([on("m1", "👍", ALICE)], undefined).get("m1")).toEqual([{ emoji: "👍", count: 1, mine: false }]);
  });
});
