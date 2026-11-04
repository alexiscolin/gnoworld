import { describe, expect, it } from "vitest";
import type { Said } from "../irc/link.ts";
import { makeRecentLines } from "./lines.ts";

// 10g (Alexis, 10g-1): each public room's last lines moderation let through, in memory, for Jarvis's question.
const ASKER = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const BOB = "g1zgldsmn6ck6w4p325xd3j8y779ky6fpjnz3uh9";
const said = (msgid: string, text: string, over: Partial<Said> = {}): Said => ({
  room: "#bubble",
  account: ALICE,
  msgid,
  text,
  time: "2026-11-04T12:00:00.000Z",
  ...over,
});
// The members rooms, #bubble/crew and #bubble/desk (members-write), are not public (rooms/types.ts's publicRoom).
const publicRooms = (room: string): boolean => !["#bubble/crew", "#bubble/desk"].includes(room);
const setup = () => makeRecentLines({ isPublic: publicRooms });
const texts = (lines: readonly { text: string }[]) => lines.map(({ text }) => text);

describe("the recent lines of a room", () => {
  it("keeps the lines moderation let through, oldest first, with their time and no account", () => {
    const recent = setup();
    recent.passed(said("m1", "hello"));
    recent.passed(said("m2", "the poll closes today", { account: BOB, time: "2026-11-04T12:01:00.000Z" }));
    expect(recent.recent("#bubble", ASKER)).toEqual([
      { speaker: 1, text: "hello", time: "2026-11-04T12:00:00.000Z" },
      { speaker: 2, text: "the poll closes today", time: "2026-11-04T12:01:00.000Z" },
    ]);
    expect(JSON.stringify(recent.recent("#bubble", ASKER))).not.toMatch(/g1/);
    expect(recent.recent("#earth", ASKER)).toEqual([]);
  });

  it("numbers who spoke by their first line, the asker as 0, the same account the same number", () => {
    const recent = setup();
    recent.passed(said("m1", "one", { account: BOB }));
    recent.passed(said("m2", "two", { account: ASKER }));
    recent.passed(said("m3", "three", { account: ALICE }));
    recent.passed(said("m4", "four", { account: BOB }));
    expect(recent.recent("#bubble", ASKER).map(({ speaker }) => speaker)).toEqual([1, 0, 2, 1]);
    // Another asker numbers the same lines from their own place.
    expect(recent.recent("#bubble", ALICE).map(({ speaker }) => speaker)).toEqual([1, 2, 0, 1]);
  });

  it("leaves out the time of a line Ergo gave none", () => {
    const recent = setup();
    recent.passed({ room: "#bubble", account: ALICE, msgid: "m1", text: "no time" });
    expect(recent.recent("#bubble", ASKER)).toStrictEqual([{ speaker: 1, text: "no time" }]);
  });

  it("keeps a room's last 30 lines, the oldest leaving first", () => {
    const recent = setup();
    for (let at = 1; at <= 31; at += 1) recent.passed(said(`m${String(at)}`, `line ${String(at)}`));
    const kept = texts(recent.recent("#bubble", ASKER));
    expect(kept).toHaveLength(30);
    expect([kept[0], kept.at(-1)]).toEqual(["line 2", "line 31"]);
  });

  it("keeps 8 KiB of a room's text at most, counted in UTF-8 bytes, the oldest leaving first", () => {
    const recent = setup();
    // Four bytes a code point in UTF-8: 512 of them are 2,048 bytes, four lines 8,192.
    const wide = String.fromCodePoint(0x1f600).repeat(512);
    for (const msgid of ["m1", "m2", "m3", "m4"]) recent.passed(said(msgid, wide));
    expect(recent.recent("#bubble", ASKER)).toHaveLength(4);
    recent.passed(said("m5", "x"));
    expect(recent.recent("#bubble", ASKER)).toHaveLength(4);
    expect(texts(recent.recent("#bubble", ASKER)).at(-1)).toBe("x");
  });

  it("keeps a line of exactly a room's 8 KiB, alone", () => {
    const recent = setup();
    recent.passed(said("m1", "older"));
    recent.passed(said("m2", "x".repeat(8192)));
    expect(texts(recent.recent("#bubble", ASKER))).toEqual(["x".repeat(8192)]);
  });

  it("gives back a taken line's bytes, so the next line leaves the older ones be", () => {
    const recent = setup();
    for (const msgid of ["m1", "m2"]) recent.passed(said(msgid, "y".repeat(4000)));
    recent.taken("#bubble", "m2");
    recent.passed(said("m3", "z".repeat(4000)));
    expect(texts(recent.recent("#bubble", ASKER))).toEqual(["y".repeat(4000), "z".repeat(4000)]);
  });

  it("never keeps a line longer than a room's 8 KiB, and keeps the room's others", () => {
    const recent = setup();
    recent.passed(said("m1", "kept"));
    recent.passed(said("m2", "y".repeat(8193)));
    expect(texts(recent.recent("#bubble", ASKER))).toEqual(["kept"]);
    recent.passed(said("m3", "z".repeat(8192 - 4)));
    expect(texts(recent.recent("#bubble", ASKER))).toEqual(["kept", "z".repeat(8188)]);
  });

  it("never keeps a line of a members room, nor of a members-write room", () => {
    const recent = setup();
    recent.passed(said("m1", "between members", { room: "#bubble/crew" }));
    recent.passed(said("m2", "between writers", { room: "#bubble/desk" }));
    expect([recent.recent("#bubble/crew", ASKER), recent.recent("#bubble/desk", ASKER)]).toEqual([[], []]);
  });

  it("keeps a line passed twice once, as a catch-up hands a line again, and drops it whole when taken", () => {
    const recent = setup();
    recent.passed(said("m1", "once"));
    recent.passed(said("m1", "once"));
    expect(texts(recent.recent("#bubble", ASKER))).toEqual(["once"]);
    recent.taken("#bubble", "m1");
    expect(recent.recent("#bubble", ASKER)).toEqual([]);
  });

  it("holds 10,000 rooms at most, the one written longest ago leaving first", () => {
    const recent = setup();
    for (let at = 0; at < 10_000; at += 1) recent.passed(said(`m${String(at)}`, "hi", { room: `#w${String(at)}` }));
    // The first room written again, so the second is the one written longest ago.
    recent.passed(said("again", "back", { room: "#w0" }));
    recent.passed(said("new", "new", { room: "#w10000" }));
    expect(texts(recent.recent("#w0", ASKER))).toEqual(["hi", "back"]);
    expect(recent.recent("#w1", ASKER)).toEqual([]);
    expect(texts(recent.recent("#w10000", ASKER))).toEqual(["new"]);
  });

  it("drops a line taken from its room at once: its author's delete or the bot's hide", () => {
    const recent = setup();
    recent.passed(said("m1", "one"));
    recent.passed(said("m2", "two"));
    recent.taken("#bubble", "m1");
    expect(texts(recent.recent("#bubble", ASKER))).toEqual(["two"]);
    recent.passed(said("m3", "three"));
    recent.taken("#bubble", "m3");
    expect(texts(recent.recent("#bubble", ASKER))).toEqual(["two"]);
  });

  it("drops the very line taken, wherever it stands in its room", () => {
    const recent = setup();
    for (const msgid of ["m1", "m2", "m3"]) recent.passed(said(msgid, msgid));
    recent.taken("#bubble", "m2");
    expect(texts(recent.recent("#bubble", ASKER))).toEqual(["m1", "m3"]);
  });

  it("remembers a line taken before it came however many plain lines follow, as a line that is no edit forgets nothing", () => {
    const recent = setup();
    recent.taken("#bubble", "early");
    for (let at = 0; at < 2001; at += 1)
      recent.edited(said(`plain${String(at)}`, "no edit", { room: `#w${String(at)}` }));
    recent.passed(said("early", "taken before it came"));
    expect(recent.recent("#bubble", ASKER)).toEqual([]);
  });

  it("drops a line its author edits at once, and keeps the edit once moderation lets it through", () => {
    const recent = setup();
    recent.passed(said("m1", "frist"));
    recent.edited(said("m2", "first", { edits: "m1" }));
    expect(recent.recent("#bubble", ASKER)).toEqual([]);
    recent.passed(said("m2", "first", { edits: "m1" }));
    expect(texts(recent.recent("#bubble", ASKER))).toEqual(["first"]);
  });

  it("keeps a line another account says it edits", () => {
    const recent = setup();
    recent.passed(said("m1", "mine"));
    recent.edited(said("m2", "not yours", { account: BOB, edits: "m1" }));
    expect(texts(recent.recent("#bubble", ASKER))).toEqual(["mine"]);
  });

  it("never lets in a line taken or edited before moderation let it through", () => {
    const recent = setup();
    recent.taken("#bubble", "m1");
    recent.edited(said("m3", "edited", { edits: "m2" }));
    recent.edited(said("m5", "edited by another", { account: BOB, edits: "m4" }));
    recent.passed(said("m1", "deleted already"));
    recent.passed(said("m2", "replaced already"));
    recent.passed(said("m4", "kept: its editor was not its author"));
    expect(texts(recent.recent("#bubble", ASKER))).toEqual(["kept: its editor was not its author"]);
  });

  it("keeps out a line taken before it came, whatever another account's edit of it says after (F5270)", () => {
    const recent = setup();
    recent.taken("#bubble", "m1");
    recent.edited(said("m9", "forged", { account: BOB, edits: "m1" }));
    recent.passed(said("m1", "deleted already"));
    expect(recent.recent("#bubble", ASKER)).toEqual([]);
  });

  it("keeps out a line its author replaced before it came, whatever another account's edit of it says after (F5270)", () => {
    const recent = setup();
    recent.edited(said("m2", "the author's edit", { edits: "m1" }));
    recent.edited(said("m9", "forged", { account: BOB, edits: "m1" }));
    recent.passed(said("m1", "replaced already"));
    expect(recent.recent("#bubble", ASKER)).toEqual([]);
  });

  it("keeps out a line it kept and then dropped, if it passes again (F5109)", () => {
    const recent = setup();
    recent.passed(said("m1", "taken"));
    recent.taken("#bubble", "m1");
    recent.passed(said("m1", "taken"));
    recent.passed(said("m2", "frist"));
    recent.edited(said("m3", "first", { edits: "m2" }));
    recent.passed(said("m2", "frist"));
    expect(recent.recent("#bubble", ASKER)).toEqual([]);
  });

  it("keeps each room's marks to its own lines, whatever their names run into", () => {
    const recent = setup();
    recent.taken("#bubble", "m1");
    recent.passed(said("1", "another room's line", { room: "#bubblem" }));
    expect(texts(recent.recent("#bubblem", ASKER))).toEqual(["another room's line"]);
  });

  it("remembers 2,000 taken lines at most, the oldest forgotten first", () => {
    const recent = setup();
    for (let at = 0; at <= 2000; at += 1) recent.taken("#bubble", `t${String(at)}`);
    recent.passed(said("t0", "forgotten, so let in"));
    recent.passed(said("t1", "still remembered"));
    expect(texts(recent.recent("#bubble", ASKER))).toEqual(["forgotten, so let in"]);
  });
});
