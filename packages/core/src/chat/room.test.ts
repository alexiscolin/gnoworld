import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { parseLine, type IrcMessage } from "../irc/irc.ts";
import { addLines, concerns, lineOf, membersAfter, redactAfter, refusedOf, topicAfter, type Line } from "./room.ts";

const ME = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const T0 = "2026-10-25T10:00:00.000Z";
// The same seed and runs as irc.test.ts, so the gate never flaps on a property.
const PROPERTY = { seed: 20261017, numRuns: 300 };
// A line as Ergo sends it, read by core/irc.
const read = (line: string): IrcMessage => {
  const parsed = parseLine(line);
  if (!parsed.ok) throw new Error(`the test's line does not parse: ${line}`);
  return parsed.message;
};
const said = (id: string, time: string, text: string) =>
  read(`@msgid=${id};time=${time};account=${ALICE} :${ALICE}!u@h PRIVMSG #bubble :${text}`);
const line = (id: string, time: string, text: string): Line => ({
  id,
  time,
  from: ALICE,
  account: ALICE,
  text,
  kind: "message",
});
// The room I look at, and my nick.
const AT = { room: "#bubble", me: ME };
// Lines by time, written apart from the code under test; lines of one time keep their arrival order.
const byTime = (p: Line, q: Line) => (p.time < q.time ? -1 : p.time > q.time ? 1 : 0);
const frozen = <T>(list: T[]): readonly T[] => Object.freeze([...list]);

// Which room a line is about, so a client with 100 rooms reads it in one: each command names it at its own place.
describe("concerns: the room a message is about", () => {
  test.each([
    ["a PRIVMSG", `:a!u@h PRIVMSG #Bubble :x`, "#bubble"],
    ["a NOTICE", `:a!u@h NOTICE #bubble :x`, "#bubble"],
    ["a TOPIC", `:a!u@h TOPIC #bubble :x`, "#bubble"],
    ["a JOIN", `:a!u@h JOIN #bubble`, "#bubble"],
    ["a PART", `:a!u@h PART #bubble`, "#bubble"],
    ["a KICK", `:a!u@h KICK #bubble b`, "#bubble"],
    ["a REDACT", `:gnoworld!u@h REDACT #bubble a`, "#bubble"],
    ["a 331", `:ergo 331 ${ME} #bubble :No topic`, "#bubble"],
    ["a 332", `:ergo 332 ${ME} #bubble :x`, "#bubble"],
    ["a 353", `:ergo 353 ${ME} = #bubble :a b`, "#bubble"],
    ["a QUIT, which every room hears", `:a!u@h QUIT :gone`, "*"],
    ["a NICK, which every room hears", `:a!u@h NICK b`, "*"],
  ])("names the room of %s", (_, text, room) => {
    expect(concerns(read(text))).toBe(room);
  });

  test.each([
    ["a 366", `:ergo 366 ${ME} #bubble :End`],
    ["a PING", "PING x"],
    ["a PRIVMSG with no target", ":a!u@h PRIVMSG"],
    ["a 353 with no room", `:ergo 353 ${ME} =`],
  ])("names no room for %s", (_, text) => {
    expect(concerns(read(text))).toBeUndefined();
  });

  test("folds A to Z alone, as Ergo's casemapping does", () => {
    expect(concerns(read(":a!u@h PRIVMSG #BUBBLÉ :x"))).toBe("#bubblÉ");
  });
});

describe("lineOf: a room's line from Ergo's message", () => {
  test("takes a PRIVMSG to the room, with its id, time, author and account", () => {
    expect(lineOf(said("a1", T0, "hello world"), "#bubble")).toStrictEqual(line("a1", T0, "hello world"));
  });

  test("names the author by its nick, and its account apart, as Ergo's account tag gives it", () => {
    const tagged = read(`@msgid=a1;time=${T0};account=${ALICE} :alice!u@h PRIVMSG #bubble :hi`);
    expect(lineOf(tagged, "#bubble")).toStrictEqual({
      id: "a1",
      time: T0,
      from: "alice",
      account: ALICE,
      text: "hi",
      kind: "message",
    });
  });

  test.each([
    ["nick!user@host", "alice!u@h"],
    ["nick@host", "alice@h"],
    ["a nick alone", "alice"],
  ])("reads the author's nick from a source of the form %s", (_, source) => {
    expect(lineOf(read(`@msgid=a1;time=${T0} :${source} PRIVMSG #bubble :x`), "#bubble")).toMatchObject({
      from: "alice",
    });
  });

  test("leaves the account out for a guest, whose line has none", () => {
    const guest = read(`@msgid=g1;time=${T0} :guest-x!u@h PRIVMSG #bubble :hi`);
    expect(lineOf(guest, "#bubble")).toStrictEqual({
      id: "g1",
      time: T0,
      from: "guest-x",
      text: "hi",
      kind: "message",
    });
  });

  test("takes a NOTICE to the room as a line of its own kind", () => {
    const notice = read(`@msgid=n1;time=${T0} :${ALICE}!u@h NOTICE #bubble :heads up`);
    expect(lineOf(notice, "#bubble")).toMatchObject({ kind: "notice", text: "heads up" });
  });

  test.each([
    ["ACTION waves", "waves"],
    ["ACTION waves with no closing mark", "waves with no closing mark"],
  ])("takes an /me (%s) as an action, its CTCP marks gone", (body, text) => {
    const closer = body.endsWith("mark") ? "" : "\u0001";
    const action = read(`@msgid=x1;time=${T0} :${ALICE}!u@h PRIVMSG #bubble :\u0001${body}${closer}`);
    expect(lineOf(action, "#bubble")).toMatchObject({ kind: "action", text });
  });

  test("keeps a text as it came: colons, double spaces and a \\u0001 inside", () => {
    const text = "a: b  c \u0001 d";
    expect(lineOf(read(`@msgid=a1;time=${T0} :${ALICE}!u@h PRIVMSG #bubble :${text}`), "#bubble")).toMatchObject({
      text,
    });
  });

  test("reads a room's name whatever the case of its ASCII letters, as Ergo's casemapping does", () => {
    expect(lineOf(read(`@msgid=a1;time=${T0} :${ALICE}!u@h PRIVMSG #Bubble :x`), "#bubble")).toMatchObject({
      id: "a1",
    });
  });

  // deploy/ergo/ircd.yaml.tmpl: casemapping ascii folds A to Z alone.
  test("folds no letter beyond ASCII", () => {
    expect(lineOf(read(`@msgid=a1;time=${T0} :${ALICE}!u@h PRIVMSG #bubblÉ :x`), "#bubblé")).toBeUndefined();
  });

  test.each([
    ["another room's line", `@msgid=a1;time=${T0} :${ALICE}!u@h PRIVMSG #garden :x`],
    ["a private message", `@msgid=a1;time=${T0} :${ALICE}!u@h PRIVMSG ${ME} :psst`],
    ["no id, which nothing could dedupe or redact", `@time=${T0} :${ALICE}!u@h PRIVMSG #bubble :x`],
    ["an empty id", `@msgid=;time=${T0} :${ALICE}!u@h PRIVMSG #bubble :x`],
    ["an id with a space", `@msgid=a\\sb;time=${T0} :${ALICE}!u@h PRIVMSG #bubble :x`],
    ["an id with a comma", `@msgid=a,b;time=${T0} :${ALICE}!u@h PRIVMSG #bubble :x`],
    ["no time", `@msgid=a1 :${ALICE}!u@h PRIVMSG #bubble :x`],
    ["an empty time", `@msgid=a1;time= :${ALICE}!u@h PRIVMSG #bubble :x`],
    ["a time that is no time", `@msgid=a1;time=yesterday :${ALICE}!u@h PRIVMSG #bubble :x`],
    ["a day that does not exist", `@msgid=a1;time=2026-02-30T10:00:00.000Z :${ALICE}!u@h PRIVMSG #bubble :x`],
    ["a 29 February out of a leap year", `@msgid=a1;time=2026-02-29T10:00:00.000Z :${ALICE}!u@h PRIVMSG #bubble :x`],
    ["an hour past 23", `@msgid=a1;time=2026-10-25T24:00:00.000Z :${ALICE}!u@h PRIVMSG #bubble :x`],
    [
      "a time with an offset, not UTC's Z",
      `@msgid=a1;time=2026-10-25T10:00:00.000+02:00 :${ALICE}!u@h PRIVMSG #bubble :x`,
    ],
    ["a time without its milliseconds", `@msgid=a1;time=2026-10-25T10:00:00Z :${ALICE}!u@h PRIVMSG #bubble :x`],
    ["a local time", `@msgid=a1;time=2026-10-25\\s10:00 :${ALICE}!u@h PRIVMSG #bubble :x`],
    ["no source", `@msgid=a1;time=${T0} PRIVMSG #bubble :x`],
    ["a source with no nick", `@msgid=a1;time=${T0} :!u@h PRIVMSG #bubble :x`],
    ["a third parameter", `@msgid=a1;time=${T0} :${ALICE}!u@h PRIVMSG #bubble a b`],
    ["a CTCP other than ACTION", `@msgid=a1;time=${T0} :${ALICE}!u@h PRIVMSG #bubble :\u0001VERSION\u0001`],
    ["an empty CTCP", `@msgid=a1;time=${T0} :${ALICE}!u@h PRIVMSG #bubble :\u0001\u0001`],
    ["an empty ACTION", `@msgid=a1;time=${T0} :${ALICE}!u@h PRIVMSG #bubble :\u0001ACTION\u0001`],
    ["no text", `@msgid=a1;time=${T0} :${ALICE}!u@h PRIVMSG #bubble`],
    ["an empty text", `@msgid=a1;time=${T0} :${ALICE}!u@h PRIVMSG #bubble :`],
    ["no parameter at all", `@msgid=a1;time=${T0} :${ALICE}!u@h PRIVMSG`],
    ["a JOIN", `:${ALICE}!u@h JOIN #bubble`],
  ])("takes no line from %s", (_, text) => {
    expect(lineOf(read(text), "#bubble")).toBeUndefined();
  });

  // A replayed event (draft/event-playback) carries its id and time too: only a PRIVMSG or a NOTICE is a line.
  test.each([
    ["a PART", `@msgid=a1;time=${T0} :${ALICE}!u@h PART #bubble :bye`],
    ["a TOPIC", `@msgid=a1;time=${T0} :${ALICE}!u@h TOPIC #bubble :new`],
    ["a KICK", `@msgid=a1;time=${T0} :${ALICE}!u@h KICK #bubble bob`],
    ["a NOTICE that is a CTCP's /me", `@msgid=a1;time=${T0} :${ALICE}!u@h NOTICE #bubble :\u0001ACTION hi\u0001`],
    [
      "a CTCP that holds ACTION later",
      `@msgid=a1;time=${T0} :${ALICE}!u@h PRIVMSG #bubble :\u0001VERSION ACTION hi\u0001`,
    ],
  ])("takes no line from %s, though it has an id and a time", (_, text) => {
    expect(lineOf(read(text), "#bubble")).toBeUndefined();
  });

  test("leaves a leap year's 29 February in", () => {
    expect(lineOf(said("a1", "2028-02-29T10:00:00.000Z", "x"), "#bubble")).toBeDefined();
  });
});

describe("addLines: a room's lines, in time order, each once, the newest kept", () => {
  const a = line("a", T0, "one");
  const b = line("b", "2026-10-25T10:00:01.000Z", "two");
  const c = line("c", "2026-10-25T10:00:02.000Z", "three");

  test("puts a page of history before the live lines, in time order", () => {
    expect(addLines(frozen([c]), frozen([a, b]), 100)).toStrictEqual([a, b, c]);
  });

  test("keeps a line once, though a reconnect's history brings it again", () => {
    expect(addLines(frozen([a, b]), frozen([b, c, a]), 100)).toStrictEqual([a, b, c]);
  });

  test("keeps a line once though it comes again with a later time, as a live line", () => {
    const lines = frozen([a, b]);
    expect(addLines(lines, [{ ...a, time: "2026-10-25T11:00:00.000Z" }], 100)).toBe(lines);
  });

  test("appends a live line of the last line's time after it, whatever its id (F773)", () => {
    const last = line("z", T0, "z");
    const live = line("a", T0, "a");
    expect(addLines(frozen([last]), [live], 100)).toStrictEqual([last, live]);
  });

  test("keeps a page's lines of one time in the page's order, and after the lines held at that time (F773)", () => {
    const held = line("m", T0, "held");
    const page = [line("z", T0, "z"), line("a", T0, "a"), line("b", "2026-10-25T09:59:59.000Z", "older")];
    expect(addLines(frozen([held]), frozen(page), 100).map((l) => l.id)).toStrictEqual(["b", "m", "z", "a"]);
  });

  test("still drops a line already held, of the last line's time, whatever its id (F773)", () => {
    const [low, high] = [line("a", T0, "a"), line("z", T0, "z")];
    const lines = frozen([low, high]);
    expect(addLines(lines, [high], 100)).toBe(lines);
    expect(addLines(lines, [low], 100)).toBe(lines);
  });

  test("keeps the newest lines, up to its cap", () => {
    expect(addLines(frozen([a, b]), frozen([c]), 2)).toStrictEqual([b, c]);
  });

  test("gives back the same array when nothing new came, so a view need not draw again", () => {
    const lines = frozen([a, b]);
    expect(addLines(lines, [a], 100)).toBe(lines);
    expect(addLines(lines, [], 100)).toBe(lines);
  });

  test("gives back the same array for a line older than its window, which it would not keep", () => {
    const lines = frozen([b, c]);
    expect(addLines(lines, [a], 2)).toBe(lines);
  });

  test.each([0, -1, 1.5, Number.NaN])("refuses a cap of %s", (cap) => {
    expect(() => addLines([], [a], cap)).toThrow(RangeError);
  });

  test("holds a flood of 10,000 lines, one at a time, to its cap: the newest 200 exactly", () => {
    const flood = Array.from({ length: 10_000 }, (_, n) => line(`m${String(n).padStart(5, "0")}`, T0, String(n)));
    let lines: readonly Line[] = [];
    for (const each of flood) lines = addLines(lines, [each], 200);
    expect(lines).toStrictEqual(flood.slice(-200));
  });

  test("holds a flood of 10,000 lines in one page, in reverse order, to its cap", () => {
    // Each line a millisecond after the one before: lines of one time keep the order they came in (F773).
    const flood = Array.from({ length: 10_000 }, (_, n) =>
      line(`m${String(n).padStart(5, "0")}`, new Date(Date.parse(T0) + n).toISOString(), String(n)),
    );
    expect(addLines([], frozen([...flood].reverse()), 200)).toStrictEqual(flood.slice(-200));
  });

  test("holds whatever order lines come in: exactly the newest, sorted, each once", () => {
    // One time for each id (7 is prime to 31, so 31 ids take 31 seconds, none twice): lines of one time keep
    // their arrival order, which a property over two arrays would have to restate; their own tests hold it.
    const lineArb = fc
      .integer({ min: 0, max: 30 })
      .map((id) =>
        line(`m${String(id)}`, `2026-10-25T10:00:${String((id * 7) % 31).padStart(2, "0")}.000Z`, `t${String(id)}`),
      );
    fc.assert(
      fc.property(
        fc.array(lineArb, { maxLength: 40 }),
        fc.array(lineArb, { maxLength: 40 }),
        fc.integer({ min: 1, max: 50 }),
        (old, incoming, cap) => {
          // A real line's id names one line: the same id is the same time and text.
          const byId = new Map([...old, ...incoming].map((l): [string, Line] => [l.id, l]));
          const canon = (ls: Line[]) => ls.map((l) => byId.get(l.id) ?? l);
          const kept = addLines(addLines([], frozen(canon(old)), cap), frozen(canon(incoming)), cap);
          expect(kept).toStrictEqual([...byId.values()].sort(byTime).slice(-cap));
        },
      ),
      PROPERTY,
    );
  });
});

// 4c's message menu: Ergo's refusal of a delete (irc/handlers.go, v2.19.1: FAIL REDACT <code> <target> <msgid> :text),
// which the page says.
describe("refusedOf: the line Ergo refused to delete", () => {
  test.each([
    ["REDACT_FORBIDDEN", ":ergo FAIL REDACT REDACT_FORBIDDEN #bubble a :You are not authorised to delete this message"],
    ["UNKNOWN_MSGID", ":ergo FAIL REDACT UNKNOWN_MSGID #bubble a :This message does not exist or is too old"],
  ])("reads the room, folded, and the msgid of a %s", (_, line) => {
    expect(refusedOf(read(line))).toStrictEqual({ room: "#bubble", id: "a" });
    expect(refusedOf(read(line.replace("#bubble", "#BUBBLE")))).toStrictEqual({ room: "#bubble", id: "a" });
  });

  test.each([
    ["a refusal of no room (INVALID_TARGET has no msgid)", ":ergo FAIL REDACT INVALID_TARGET #bubble :No such channel"],
    ["another command's FAIL", ":ergo FAIL CHATHISTORY MESSAGE_ERROR #bubble a :error"],
    ["a WARN of a REDACT", ":ergo WARN REDACT REDACT_FORBIDDEN #bubble a :careful"],
    ["a FAIL REDACT cut short", ":ergo FAIL REDACT REDACT_FORBIDDEN #bubble"],
    // The green pass (G13): a reply of another shape than Ergo's five parameters is no refusal read.
    ["a FAIL REDACT with a parameter more", ":ergo FAIL REDACT REDACT_FORBIDDEN #bubble a b :You are not"],
    ["a REDACT itself", ":gnoworld!u@h REDACT #bubble a"],
  ])("reads none of %s", (_, line) => {
    expect(refusedOf(read(line))).toBeUndefined();
  });
});

describe("redactAfter: a line hidden by moderation", () => {
  const a = line("a", T0, "one");
  const b = line("b", "2026-10-25T10:00:01.000Z", "two");

  test("leaves the room on Ergo's REDACT of its id", () => {
    const redact = read(":gnoworld!u@h REDACT #bubble a :hidden by moderation");
    expect(redactAfter(frozen([a, b]), redact, "#bubble")).toStrictEqual([b]);
  });

  test("reads the REDACT's room whatever its case", () => {
    expect(redactAfter(frozen([a, b]), read(":gnoworld!u@h REDACT #BUBBLE a"), "#bubble")).toStrictEqual([b]);
  });

  test.each([
    ["a REDACT of another room", ":gnoworld!u@h REDACT #garden a"],
    ["a REDACT of a line it does not hold", ":gnoworld!u@h REDACT #bubble zz"],
    ["a REDACT with no id", ":gnoworld!u@h REDACT #bubble"],
    ["a REDACT with nothing", ":gnoworld!u@h REDACT"],
    ["a REDACT aimed at a nick", `:gnoworld!u@h REDACT ${ALICE} a`],
    ["a message whose text is a held line's id", `@msgid=x;time=${T0} :${ALICE}!u@h PRIVMSG #bubble a`],
  ])("keeps the room as it is for %s", (_, text) => {
    const lines = frozen([a, b]);
    expect(redactAfter(lines, read(text), "#bubble")).toBe(lines);
  });
});

describe("membersAfter: who is here", () => {
  const names = (list: string, symbol = "=") => read(`:ergo 353 ${ME} ${symbol} #bubble :${list}`);
  const after = (here: readonly string[], text: string) => membersAfter(frozen([...here]), read(text), AT);

  test("takes NAMES' replies, every prefix off, sorted in code-unit order", () => {
    expect(membersAfter([], names(`~Zed &amy @alice %hal +bob @+carl ${ME}`), AT)).toStrictEqual([
      "Zed",
      "alice",
      "amy",
      "bob",
      "carl",
      ME,
      "hal",
    ]);
  });

  test.each(["=", "*", "@"])("reads a NAMES line whatever its channel symbol (%s)", (symbol) => {
    expect(membersAfter([], names("bob", symbol), AT)).toStrictEqual(["bob"]);
  });

  test("adds each NAMES line to the last, and leaves the list at its end (366)", () => {
    const one = membersAfter([], names("alice bob"), AT);
    const two = membersAfter(one, names("carl"), AT);
    expect(two).toStrictEqual(["alice", "bob", "carl"]);
    expect(membersAfter(two, read(`:ergo 366 ${ME} #bubble :End of NAMES list`), AT)).toBe(two);
  });

  test("leaves out an empty name: double spaces, a trailing one, a prefix alone", () => {
    expect(membersAfter([], names("a  b  @"), AT)).toStrictEqual(["a", "b"]);
  });

  test("gives back the same list for NAMES that add nobody", () => {
    const here = frozen(["alice"]);
    expect(membersAfter(here, names("@alice"), AT)).toBe(here);
  });

  test("adds a JOIN, an extended one too", () => {
    expect(after(["alice"], ":bob!u@h JOIN #bubble")).toStrictEqual(["alice", "bob"]);
    expect(after(["alice"], ":bob!u@h JOIN #bubble bobacct :Bob Real")).toStrictEqual(["alice", "bob"]);
  });

  test("puts a JOIN in its place among the people here", () => {
    expect(after(["alice", "carl"], ":bob!u@h JOIN #bubble")).toStrictEqual(["alice", "bob", "carl"]);
    expect(after(["bob", "carl"], ":alice!u@h JOIN #bubble")).toStrictEqual(["alice", "bob", "carl"]);
  });

  test("removes a PART", () => {
    expect(after(["alice", "bob"], ":bob!u@h PART #bubble :bye")).toStrictEqual(["alice"]);
  });

  test("removes a QUIT", () => {
    expect(after(["alice", "bob"], ":bob!u@h QUIT :gone")).toStrictEqual(["alice"]);
  });

  test("removes a KICK's target", () => {
    expect(after(["alice", "bob"], ":alice!u@h KICK #bubble bob :out")).toStrictEqual(["alice"]);
  });

  test("renames on NICK, the list sorted again", () => {
    expect(after(["alice", "bob"], ":bob!u@h NICK aaa")).toStrictEqual(["aaa", "alice"]);
  });

  test("starts a fresh list on my own JOIN: NAMES follows, and the last list may be stale", () => {
    expect(after(["alice", "bob"], `:${ME}!u@h JOIN #bubble`)).toStrictEqual([ME]);
  });

  test.each([
    ["my own PART", `:${ME}!u@h PART #bubble`],
    ["a KICK of me", `:alice!u@h KICK #bubble ${ME} :out`],
  ])("empties the list on %s: I am no longer here to know", (_, text) => {
    expect(after(["alice", ME], text)).toStrictEqual([]);
  });

  test("reads a room's name whatever its case", () => {
    expect(after(["alice"], ":bob!u@h JOIN #BUBBLE")).toStrictEqual(["alice", "bob"]);
  });

  test.each([
    ["another room's JOIN", ":bob!u@h JOIN #garden"],
    ["another room's PART", ":alice!u@h PART #garden"],
    ["another room's KICK", ":alice!u@h KICK #garden alice"],
    ["another room's NAMES", `:ergo 353 ${ME} = #garden :zed`],
    ["a replayed JOIN", "@batch=h1 :bob!u@h JOIN #bubble"],
    ["a replayed PART", "@batch=h1 :alice!u@h PART #bubble"],
    ["a replayed QUIT", "@batch=h1 :alice!u@h QUIT :gone"],
    ["a replayed KICK", "@batch=h1 :bob!u@h KICK #bubble alice"],
    ["a replayed NICK", "@batch=h1 :alice!u@h NICK zz"],
    ["a replayed NAMES", `@batch=h1 :ergo 353 ${ME} = #bubble :zed`],
    ["a batch tag with no value", "@batch :bob!u@h JOIN #bubble"],
    ["a JOIN of one already here", ":alice!u@h JOIN #bubble"],
    ["a PART of one not here", ":bob!u@h PART #bubble"],
    ["a QUIT of one not here", ":bob!u@h QUIT :gone"],
    ["a KICK of one not here", ":alice!u@h KICK #bubble bob"],
    ["a NICK of one not here", ":bob!u@h NICK zz"],
    ["a JOIN with no room", ":bob!u@h JOIN"],
    ["a JOIN with no source", "JOIN #bubble"],
    ["a PART with no room", ":alice!u@h PART"],
    ["a KICK with no target", ":bob!u@h KICK #bubble"],
    ["a NICK with no nick", ":alice!u@h NICK"],
    ["a NAMES with no list", `:ergo 353 ${ME} = #bubble`],
    ["any other line", "PING x"],
  ])("gives back the same list for %s", (_, text) => {
    const here = frozen(["alice"]);
    expect(membersAfter(here, read(text), AT)).toBe(here);
  });
});

describe("topicAfter: the room's description", () => {
  test("reads RPL_TOPIC (332)", () => {
    expect(topicAfter(undefined, read(`:ergo 332 ${ME} #bubble :A place for bubbles`), "#bubble")).toBe(
      "A place for bubbles",
    );
  });

  test("reads a TOPIC change", () => {
    expect(topicAfter("old", read(`:${ALICE}!u@h TOPIC #bubble :new words`), "#bubble")).toBe("new words");
  });

  test("clears on an empty TOPIC", () => {
    expect(topicAfter("old", read(`:${ALICE}!u@h TOPIC #bubble :`), "#bubble")).toBeUndefined();
  });

  test("clears on an empty RPL_TOPIC", () => {
    expect(topicAfter("old", read(`:ergo 332 ${ME} #bubble :`), "#bubble")).toBeUndefined();
  });

  test("clears on RPL_NOTOPIC (331)", () => {
    expect(topicAfter("old", read(`:ergo 331 ${ME} #bubble :No topic is set`), "#bubble")).toBeUndefined();
  });

  test("reads a room's name whatever its case", () => {
    expect(topicAfter("old", read(`:${ALICE}!u@h TOPIC #Bubble :new`), "#bubble")).toBe("new");
  });

  test.each([
    ["the topic's setter (333)", `:ergo 333 ${ME} #bubble ${ALICE}!u@h 1700000000`],
    ["the end of NAMES (366)", `:ergo 366 ${ME} #bubble :End of /NAMES list.`],
    ["a MODE", `:${ALICE}!u@h MODE #bubble +o bob`],
    ["another room's TOPIC", `:${ALICE}!u@h TOPIC #garden :theirs`],
    ["another room's 332", `:ergo 332 ${ME} #garden :theirs`],
    ["another room's 331", `:ergo 331 ${ME} #garden :No topic`],
    ["a 332 with no text", `:ergo 332 ${ME} #bubble`],
    ["a TOPIC with no room", `:${ALICE}!u@h TOPIC`],
    ["a line of the room", `@msgid=a;time=${T0} :${ALICE}!u@h PRIVMSG #bubble :x`],
  ])("leaves the topic alone for %s", (_, text) => {
    expect(topicAfter("mine", read(text), "#bubble")).toBe("mine");
  });
});

// 4d: a reaction travels as a TAGMSG to its room (draft/react), which a client with 100 rooms reads in that one.
describe("concerns: a reaction's room", () => {
  test("names the room of a TAGMSG, whatever its case", () => {
    expect(concerns(read(`@+draft/react=x;+reply=a :${ALICE}!u@h TAGMSG #Bubble`))).toBe("#bubble");
  });
});

// 4d: a line answers another by its msgid (+reply, ratified in 2026; +draft/reply, its draft name, read too:
// docs/plans/chat-features.md, M2). A value is a msgid a tag may carry back, of 64 characters at most, or no mark.
describe("lineOf: the line a line answers", () => {
  const tagged = (tags: string) =>
    read(`@msgid=b;time=${T0};account=${ALICE};${tags} :${ALICE}!u@h PRIVMSG #bubble :x`);

  test("keeps the msgid a reply answers, from +reply or its draft name, +reply first", () => {
    expect(lineOf(tagged("+reply=a"), "#bubble")?.reply).toBe("a");
    expect(lineOf(tagged("+draft/reply=a"), "#bubble")?.reply).toBe("a");
    expect(lineOf(tagged("+reply=a;+draft/reply=z"), "#bubble")?.reply).toBe("a");
  });

  test("reads the draft name when +reply holds no msgid", () => {
    expect(lineOf(tagged("+reply=a,b;+draft/reply=z"), "#bubble")?.reply).toBe("z");
  });

  test("adds no reply key to a line that answers none", () => {
    expect(Object.keys(lineOf(said("b", T0, "x"), "#bubble") ?? {})).not.toContain("reply");
  });

  // A tag's value is escaped on the wire (\s a space, \: a semicolon, \\ a backslash): the parser hands it back whole.
  test.each([
    ["nothing", ""],
    ["a space", String.raw`a\sb`],
    ["a semicolon", String.raw`a\:b`],
    ["a backslash", String.raw`a\\b`],
    ["a leading space", String.raw`\sa`],
    ["a leading semicolon", String.raw`\:a`],
    ["a leading backslash", String.raw`\\a`],
    ["a leading comma", ",a"],
    ["a tab", "a\tb"],
    ["a leading tab", "\ta"],
    ["a CR", String.raw`a\rb`],
    ["a leading CR", String.raw`\ra`],
    ["an LF", String.raw`a\nb`],
    ["a leading LF", String.raw`\na`],
    ["a comma", "a,b"],
    ["a leading colon", ":a"],
    ["65 characters", "a".repeat(65)],
  ])("takes no reply of a value holding %s", (_, value) => {
    const answering = lineOf(tagged(`+reply=${value};+draft/reply=${value}`), "#bubble");
    expect(answering).toBeDefined();
    expect(Object.keys(answering ?? {})).not.toContain("reply");
  });

  test("keeps a msgid of 64 characters, the longest the link sends", () => {
    expect(lineOf(tagged(`+reply=${"a".repeat(64)}`), "#bubble")?.reply).toBe("a".repeat(64));
  });
});

// 4d: a line corrects one of its author's by our own tag (+gnoworld/edit, docs/decisions.md 2026-10-21), whose value is
// a msgid a tag may carry back, of 64 characters at most, or no mark.
describe("lineOf: the line a line corrects", () => {
  const tagged = (tags: string) =>
    read(`@msgid=b;time=${T0};account=${ALICE};${tags} :${ALICE}!u@h PRIVMSG #bubble :x`);

  test("keeps the msgid an edit corrects", () => {
    expect(lineOf(tagged("+gnoworld/edit=a"), "#bubble")?.edits).toBe("a");
  });

  test("keeps both marks of a line that answers one line and corrects another", () => {
    expect(lineOf(tagged("+reply=a;+gnoworld/edit=c"), "#bubble")).toEqual({
      id: "b",
      time: T0,
      from: ALICE,
      account: ALICE,
      text: "x",
      kind: "message",
      reply: "a",
      edits: "c",
    });
  });

  test("adds no edits key to a line that corrects none", () => {
    expect(Object.keys(lineOf(said("b", T0, "x"), "#bubble") ?? {})).not.toContain("edits");
  });

  test.each([
    ["nothing", ""],
    ["a space", String.raw`a\sb`],
    ["a semicolon", String.raw`a\:b`],
    ["a backslash", String.raw`a\\b`],
    ["a leading space", String.raw`\sa`],
    ["a leading semicolon", String.raw`\:a`],
    ["a leading backslash", String.raw`\\a`],
    ["a leading comma", ",a"],
    ["a tab", "a\tb"],
    ["a leading tab", "\ta"],
    ["a CR", String.raw`a\rb`],
    ["a leading CR", String.raw`\ra`],
    ["an LF", String.raw`a\nb`],
    ["a leading LF", String.raw`\na`],
    ["a comma", "a,b"],
    ["a leading colon", ":a"],
    ["65 characters", "a".repeat(65)],
  ])("takes no edit of a value holding %s", (_, value) => {
    const correcting = lineOf(tagged(`+gnoworld/edit=${value}`), "#bubble");
    expect(correcting).toBeDefined();
    expect(Object.keys(correcting ?? {})).not.toContain("edits");
  });

  test("keeps a msgid of 64 characters", () => {
    expect(lineOf(tagged(`+gnoworld/edit=${"a".repeat(64)}`), "#bubble")?.edits).toBe("a".repeat(64));
  });
});
