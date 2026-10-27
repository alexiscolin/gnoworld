import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { dmNotice, roomNotice, type NoticeLine, type RoomAt } from "./notice.ts";
import type { Line } from "./room.ts";

const ME = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const BOB = "g1f6dcp6he2vq9gymrm4yrnyx66n0578vf7fsksl";
const T = (minute: number) => `2026-10-25T10:${String(minute).padStart(2, "0")}:00.000Z`;
const ROOM = "#bubble/games";

const line = (text: string, over: Partial<NoticeLine> = {}): NoticeLine => ({
  id: "m1",
  time: T(5),
  from: ALICE,
  account: ALICE,
  kind: "message",
  text,
  ...over,
});
// A guest's line: a nick, and no account for Ergo to vouch for.
const guestLine = (text: string, from: string): NoticeLine => ({ id: "m1", time: T(5), from, kind: "message", text });
const at = (over: Partial<RoomAt> = {}): RoomAt => ({ me: ME, mode: "mentions", held: [], groups: false, ...over });
const kindOf = (text: string, over: Partial<NoticeLine> = {}, where: Partial<RoomAt> = {}) =>
  roomNotice(line(text, over), ROOM, at(where))?.kind;

// 4f-n (docs/decisions.md, 2026-10-26 "Notifications wait for a merge of their own"; docs/plans/slice-4.md §1): what a
// line is to the account that reads it. The kinds are a mention, a mention of the whole room, a reply, a direct message.
describe("roomNotice: a room's line that is addressed to the account", () => {
  test("is a mention when the line names the account, with the line's id, time and author, in its room", () => {
    expect(roomNotice(line(`hello @${ME}`), ROOM, at())).toEqual({
      id: "m1",
      kind: "mention",
      where: ROOM,
      time: T(5),
      by: ALICE,
    });
  });

  test("is none when the line names someone else, or the account's address with no @", () => {
    expect(kindOf(`hello @${BOB}`)).toBeUndefined();
    expect(kindOf(`hello ${ME}`)).toBeUndefined();
    expect(kindOf("hello everyone")).toBeUndefined();
  });

  // The line view marks "Mentions you" from the same tree: a notice the line does not show would be a ghost.
  test.each([
    ["in a code span", `see \`@${ME}\``],
    ["in a code block", `\`\`\`\n@${ME}\n\`\`\``],
    ["in a link's label", `[@${ME}](https://gno.land)`],
    ["after a letter", `x@${ME}`],
  ])("is none when the mention is %s, as the line shows no mark for it", (_, text) => {
    expect(kindOf(text)).toBeUndefined();
  });

  test("reads the mention in a quote, a list item and a mark, as the line's tree has it", () => {
    expect(kindOf(`> @${ME} said so`)).toBe("mention");
    expect(kindOf(`- @${ME}`)).toBe("mention");
    expect(kindOf(`**@${ME}**`)).toBe("mention");
  });

  test("is none for the account's own line, whatever it says, from this device or another", () => {
    expect(kindOf(`note to @${ME}`, { account: ME, from: ME })).toBeUndefined();
    expect(kindOf("@room", { account: ME, from: ME }, { groups: true })).toBeUndefined();
  });

  // The own-line guard stands before every kind: a reply of the account's to its own line is no one's notice.
  test.each(["mentions", "all"] as const)("is none for the account's reply to its own line, in mode %s", (mode) => {
    const mine = line("my question", { id: "q1", time: T(1), account: ME, from: ME });
    expect(kindOf("my answer", { reply: "q1", account: ME, from: ME }, { mode, held: [mine] })).toBeUndefined();
  });

  // R16: an edit is a line of its own that names the line it corrects (+gnoworld/edit), shown in that line's place: the
  // line made its notice when it came, so an edit makes none, one that adds a mention included.
  test("is none for an edit of a line, whatever it names", () => {
    expect(kindOf(`@${ME} corrected`, { edits: "m0" })).toBeUndefined();
    expect(kindOf("@room corrected", { edits: "m0" }, { groups: true })).toBeUndefined();
    expect(
      kindOf("corrected", { edits: "m0", reply: "q1" }, { held: [line("q", { id: "q1", account: ME })] }),
    ).toBeUndefined();
  });

  test("is none for a notice (a bot's or a server's line), and a mention for an /me action", () => {
    expect(kindOf(`@${ME} your line was hidden`, { kind: "notice", from: "gnoworld" })).toBeUndefined();
    expect(kindOf(`waves at @${ME}`, { kind: "action" })).toBe("mention");
  });

  test("names a guest author by its nick, a guest having no account", () => {
    expect(roomNotice(guestLine(`@${ME}`, "guest-abc123"), ROOM, at())?.by).toBe("guest-abc123");
  });

  test("is none for a guest reader, who has no address to be named by", () => {
    expect(kindOf(`@${ME}`, {}, { me: undefined })).toBeUndefined();
    expect(kindOf("@room", {}, { me: undefined, groups: true })).toBeUndefined();
  });

  // The mode is what the reader chose for the room: none means none, mentions not excepted; all and mentions make the
  // same notices (the mode only changes what counts as unread, store/notices.ts).
  test.each(["all", "mentions"] as const)("makes the same notice in mode %s", (mode) => {
    expect(kindOf(`@${ME}`, {}, { mode })).toBe("mention");
  });

  test("makes none in mode none, for a mention, a reply and a mention of the room", () => {
    const mine = line("mine", { id: "mine", account: ME, from: ME });
    expect(kindOf(`@${ME}`, {}, { mode: "none" })).toBeUndefined();
    expect(kindOf("ok", { reply: "mine" }, { mode: "none", held: [mine] })).toBeUndefined();
    expect(kindOf("@room", {}, { mode: "none", groups: true })).toBeUndefined();
  });
});

describe("roomNotice: a reply to a line of the account's", () => {
  const mine = line("my question", { id: "q1", time: T(1), account: ME, from: ME });
  const theirs = line("their question", { id: "q2", time: T(2), account: BOB, from: BOB });

  test("is a reply when the line it answers is the account's, found among the room's lines held", () => {
    expect(roomNotice(line("answer", { reply: "q1" }), ROOM, at({ held: [theirs, mine] }))).toEqual({
      id: "m1",
      kind: "reply",
      where: ROOM,
      time: T(5),
      by: ALICE,
    });
  });

  test("is none when the line it answers is someone else's, or is not held (past the window), or it answers none", () => {
    expect(kindOf("answer", { reply: "q2" }, { held: [theirs, mine] })).toBeUndefined();
    expect(kindOf("answer", { reply: "q1" }, { held: [theirs] })).toBeUndefined();
    expect(kindOf("answer", {}, { held: [mine] })).toBeUndefined();
  });

  test("is none when the reader is a guest, whatever the line answers", () => {
    expect(kindOf("answer", { reply: "q1" }, { held: [mine], me: undefined })).toBeUndefined();
  });

  test("reads the author of the line answered by its account, never its nick", () => {
    const nickOnly = { ...guestLine("a line from a guest named like me", ME), id: "q3" };
    expect(kindOf("answer", { reply: "q3" }, { held: [nickOnly] })).toBeUndefined();
  });
});

describe("roomNotice: a mention of the whole room", () => {
  test.each([
    ["alone", "@room"],
    ["after a space", "hello @room, a word"],
    ["after punctuation", "(@room) listen"],
    ["in capitals", "@ROOM"],
    ["in a mark", "**@room**"],
    ["at the end of a sentence", "ping @room."],
    ["with a zero-width mark inside, which shows as @room", "@r\u200boom"],
    ["with a combining accent after it, which the server folds away", "@room\u0301"],
    ["after a code span, whose closing mark is no letter", "`x`@room"],
    ["in a quote", "> @room"],
    ["in a list item", "- @room"],
    ["on a line after another", "one\n@room"],
    ["after a mention of someone", `@${BOB} @room`],
    ["after a link", "[x](https://gno.land) @room"],
    ["after a mark", "**a** @room"],
    ["in a later paragraph", "intro\n\n@room"],
    ["in one item of several", "- a\n- @room"],
    ["in a quote's later paragraph", "> q\n\n@room"],
    ["right after a mark's closing", "**a**@room"],
    ["right after a link's closing", "[x](https://gno.land)@room"],
  ])("is a group mention %s, where it may count", (_, text) => {
    expect(kindOf(text, {}, { groups: true })).toBe("group");
  });

  test.each([
    ["after a letter", "mail@room"],
    ["before a letter", "@rooms"],
    ["before an underscore", "@room_x"],
    ["in a code span", "`@room`"],
    ["in a link's label", "[@room](https://gno.land)"],
    ["with no @", "room"],
    ["after a letter and a zero-width mark, which the server folds away", "x\u200b@room"],
    ["after a letter and a combining accent, which the server folds away", "e\u0301@room"],
    ["before a letter with an accent", "@roomé"],
    ["right after a mention, which ends in a letter", `@${BOB}@room`],
  ])("is none when it stands %s", (_, text) => {
    expect(kindOf(text, {}, { groups: true })).toBeUndefined();
  });

  test("is none in a room where it may not count: the page tells which rooms those are", () => {
    expect(kindOf("@room", {}, { groups: false })).toBeUndefined();
  });

  test("names the author of the line", () => {
    expect(roomNotice(line("@room"), ROOM, at({ groups: true }))).toMatchObject({ kind: "group", by: ALICE });
  });
});

describe("roomNotice: a line that is several things at once", () => {
  const mine = line("my question", { id: "q1", time: T(1), account: ME, from: ME });
  test("is one notice, a mention before a reply, a reply before a mention of the room", () => {
    const held = [mine];
    const where = { held, groups: true };
    expect(kindOf(`@${ME} @room`, { reply: "q1" }, where)).toBe("mention");
    expect(kindOf("@room", { reply: "q1" }, where)).toBe("reply");
    expect(kindOf(`@${ME} @room`, {}, where)).toBe("mention");
  });

  test("never makes a notice of a line with no @ and no reply, whatever it holds", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 200 }).filter((text) => !text.includes("@") && text !== ""),
        (text) => {
          expect(roomNotice(line(text), ROOM, at({ groups: true }))).toBeUndefined();
        },
      ),
    );
  });
});

describe("dmNotice: a direct message", () => {
  const to = (from: string, partner: string, over: Partial<Line> = {}) => ({
    partner,
    line: line("hi", { id: "d1", from, account: from, ...over }),
  });

  test("is a notice by its partner, kept under the partner's address, when the partner wrote it", () => {
    expect(dmNotice(to(ALICE, ALICE), ME)).toEqual({ id: "d1", kind: "dm", where: ALICE, time: T(5), by: ALICE });
  });

  test("is none for the account's own message, as Ergo echoes it", () => {
    expect(dmNotice(to(ME, ALICE), ME)).toBeUndefined();
  });

  test("is none for a guest reader", () => {
    expect(dmNotice(to(ALICE, ALICE), undefined)).toBeUndefined();
  });

  // R8: a NOTICE is what a bot or a server sends, a DM's too: one rule for the room and the nick.
  test("is none for an account's NOTICE to the reader, as for a room's", () => {
    expect(dmNotice(to(ALICE, ALICE, { kind: "notice" }), ME)).toBeUndefined();
  });

  test("is a notice whatever the text says, a mention or none", () => {
    expect(dmNotice(to(ALICE, ALICE, { text: `@${BOB}` }), ME)?.kind).toBe("dm");
  });
});
