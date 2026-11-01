import { describe, expect, it } from "vitest";
import type { Line } from "../chat/room.ts";
import { bubbleLines, type EarthRoom } from "./lines.ts";

// The seam between the store and the rules: a room's lines as `pickBubbles` reads them. It decides what a bubble may be made of, so it fails
// closed: what it does not know to be public is not.
const TIME = "2026-11-02T12:00:00.000Z";
const AT = Date.parse(TIME);
const ME = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";

function line(id: string, over: Partial<Line> = {}): Line {
  return { id, time: TIME, from: "ann", account: "g1ann", text: "hello", kind: "message", country: "JP", ...over };
}
function room(lines: readonly Line[], over: Partial<EarthRoom> = {}): EarthRoom {
  return { type: "open", lines, hidden: () => false, ...over };
}
const read = (rooms: readonly EarthRoom[], joined = true) => bubbleLines(rooms, { joined, since: 0 });

describe("bubbleLines", () => {
  it("reads nothing from nothing", () => {
    expect(read([])).toEqual([]);
    expect(read([room([])])).toEqual([]);
  });

  it("gives a line its time, account, words and country, public and joined", () => {
    expect(read([room([line("m1")])])).toEqual([
      {
        id: "m1",
        at: AT,
        account: "g1ann",
        text: "hello",
        country: "JP",
        visibility: "public",
        joined: true,
        mentions: [],
      },
    ]);
  });

  it("names a guest by its nick, which is all a guest has", () => {
    const guest = { ...line("m1", { from: "guest-7" }) };
    delete guest.account;
    expect(read([room([guest])])[0]?.account).toBe("guest-7");
  });

  it("guesses no country: a line with none stays with none", () => {
    const bare = { ...line("m1") };
    delete bare.country;
    expect(read([room([bare])])[0]).not.toHaveProperty("country");
  });

  it.each(["open", "announcement"] as const)("calls a room of type %s public: anyone may read it", (type) => {
    expect(read([room([line("m1")], { type })])[0]?.visibility).toBe("public");
  });

  it.each(["accounts", "members", "members-write"] as const)(
    "calls a room of type %s private: not everyone may read it, so the globe does not say it",
    (type) => {
      expect(read([room([line("m1")], { type })])[0]?.visibility).toBe("private");
    },
  );

  it("calls a room it does not know the type of private: the list not read yet shows no bubble", () => {
    expect(read([room([line("m1")], { type: undefined })])[0]?.visibility).toBe("private");
  });

  it("is joined only while the link is up: the lines kept for reading are no bubbles", () => {
    expect(read([room([line("m1")])], false)[0]?.joined).toBe(false);
  });

  it("leaves out notices and actions: a bubble is a person's words", () => {
    expect(read([room([line("n1", { kind: "notice" }), line("a1", { kind: "action" })])])).toEqual([]);
  });

  it("marks a line the moderation hid", () => {
    const hidden = (id: string) => id === "m1";
    expect(read([room([line("m1"), line("m2")], { hidden })]).map((m) => m.hidden === true)).toEqual([true, false]);
  });

  it("shows a corrected line in its correction's words, its own id kept", () => {
    const edit = line("e1", { text: "hello again", edits: "m1" });
    expect(read([room([line("m1"), edit])]).map(({ id, text }) => [id, text])).toEqual([["m1", "hello again"]]);
  });

  it("keeps another account's correction from another's words: it stays a line of its own", () => {
    const edit = line("e1", { text: "words put in her mouth", edits: "m1", account: "g1bob", from: "bob" });
    expect(read([room([line("m1"), edit])]).map(({ id, text, account }) => [id, text, account])).toEqual([
      ["m1", "hello", "g1ann"],
      ["e1", "words put in her mouth", "g1bob"],
    ]);
  });

  it("hides a corrected line when its newest words were hidden: the words shown are the edit's (F1921)", () => {
    const edit = line("e1", { text: "rude", edits: "m1" });
    const out = read([room([line("m1"), edit], { hidden: (id) => id === "e1" })]);
    expect(out.map(({ id, hidden }) => [id, hidden])).toEqual([["m1", true]]);
  });

  it("reads a mention of the viewer, and parses no line that holds no @", () => {
    const named = line("m1", { text: `hello @${ME}` });
    expect(read([room([named])])[0]?.mentions).toEqual([ME]);
    expect(read([room([line("m2", { text: "hello" })])])[0]?.mentions).toEqual([]);
  });

  it("reads no mention of a line too old to be a bubble: parsing it would buy nothing", () => {
    const named = line("m1", { text: `hello @${ME}` });
    expect(bubbleLines([room([named])], { joined: true, since: AT + 1 })[0]?.mentions).toEqual([]);
    expect(bubbleLines([room([named])], { joined: true, since: AT })[0]?.mentions).toEqual([ME]);
  });

  it("keeps a mention inside code out, as the chat does", () => {
    expect(read([room([line("m1", { text: `\`@${ME}\`` })])])[0]?.mentions).toEqual([]);
  });

  it("reads every room's lines", () => {
    const out = read([room([line("m1")]), room([line("m2", { country: "FR" })])]);
    expect(out.map(({ id, country }) => [id, country])).toEqual([
      ["m1", "JP"],
      ["m2", "FR"],
    ]);
  });

  it("drops a line whose time cannot be read, rather than date it now", () => {
    expect(read([room([line("m1", { time: "not a time" })])])).toEqual([]);
  });
});
