import { describe, expect, it } from "vitest";
import { dropFilter, parseFind, setFilter, toQuery, type Who } from "./filters.ts";

// The chat's search field, read as the canvas shows it: words, then `in:#room`, `from:@kai`, `has:link`. Pure functions from the field's
// text to what the server is asked; a filter that names nothing found is never turned into a wider search.
const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const BOB = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const BOBBY = "g1jg8mtxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
const WHO: Who = {
  me: ALICE,
  members: [ALICE, BOB, "guest-1"],
  rooms: ["#bubble", "#bubble/games", "#bubble/dev"],
};

describe("the field's words and filters", () => {
  it("is plain words when no filter is typed", () => {
    expect(parseFind("treasury quorum", WHO)).toEqual({ words: "treasury quorum", link: false, bad: [] });
  });

  it("reads has:link, whatever its case, wherever it stands", () => {
    expect(parseFind("has:link quorum", WHO)).toMatchObject({ words: "quorum", link: true });
    expect(parseFind("quorum HAS:Link", WHO)).toMatchObject({ words: "quorum", link: true });
  });

  it("reads in:#room by its label or its id", () => {
    expect(parseFind("in:#games quorum", WHO)).toMatchObject({ words: "quorum", room: "#bubble/games" });
    expect(parseFind("in:#bubble/dev quorum", WHO)).toMatchObject({ room: "#bubble/dev" });
    expect(parseFind("in:#bubble quorum", WHO)).toMatchObject({ room: "#bubble" });
  });

  it("reads from:@me, a whole address and a member's address by its start", () => {
    expect(parseFind("from:@me quorum", WHO)).toMatchObject({ words: "quorum", from: ALICE });
    expect(parseFind(`from:${BOB} quorum`, WHO)).toMatchObject({ from: BOB });
    expect(parseFind(`from:@${BOB.slice(0, 6)} quorum`, WHO)).toMatchObject({ from: BOB });
  });

  it("keeps a filter's name inside a quoted phrase as words, the phrase whole", () => {
    expect(parseFind('"from:@kai is away" quorum', WHO)).toEqual({
      words: '"from:@kai is away" quorum',
      link: false,
      bad: [],
    });
  });

  it("ignores a filter with no name yet, which the reader is still typing, and does not search it as a word", () => {
    expect(parseFind("quorum from:", WHO)).toEqual({ words: "quorum", link: false, bad: [] });
    expect(parseFind("quorum in:", WHO)).toEqual({ words: "quorum", link: false, bad: [] });
    expect(parseFind("quorum from:@", WHO)).toEqual({ words: "quorum", link: false, bad: [] });
  });

  it("names a filter that finds nothing, rather than widening the search", () => {
    expect(parseFind("quorum from:@nobody", WHO).bad).toEqual(["from:@nobody"]);
    expect(parseFind("quorum in:#nowhere", WHO).bad).toEqual(["in:#nowhere"]);
    expect(parseFind("quorum has:poll", WHO).bad).toEqual(["has:poll"]);
    expect(parseFind("quorum from:@me", { members: [], rooms: [] }).bad).toEqual(["from:@me"]);
  });

  it("calls a start that two members share ambiguous, so bad", () => {
    const two: Who = { ...WHO, members: [BOB, BOBBY] };
    expect(parseFind(`quorum from:@${BOB.slice(0, 6)}`, two).bad).toHaveLength(1);
  });

  it("takes the last of a filter typed twice", () => {
    expect(parseFind("in:#games in:#dev quorum", WHO).room).toBe("#bubble/dev");
  });
});

describe("a filter set or dropped in the field's text", () => {
  it("adds a filter at the end, replaces the one that is there, and drops it for no value", () => {
    expect(setFilter("quorum", "has", "link")).toBe("quorum has:link");
    expect(setFilter("quorum in:#games", "in", "#dev")).toBe("quorum in:#dev");
    expect(setFilter("quorum in:#games has:link", "in", undefined)).toBe("quorum has:link");
  });

  it("does not touch a filter's name quoted in a phrase", () => {
    expect(setFilter('"in:#games" quorum', "in", "#dev")).toBe('"in:#games" quorum in:#dev');
  });

  it("drops every filter of a key, the words left as they are", () => {
    expect(dropFilter("tokenomics from:@bruna", "from")).toBe("tokenomics");
    expect(dropFilter("from:@a from:@b tokenomics", "from")).toBe("tokenomics");
  });
});

describe("what the server is asked", () => {
  const now = new Date("2026-11-11T12:00:00Z");
  const base = { world: "bubble", who: WHO, now, time: "any" } as const;

  it("is the words and the world alone for plain words", () => {
    expect(toQuery("quorum", base)).toEqual({ q: "quorum", world: "bubble" });
  });

  it("carries the room, the sender and the link as the route reads them", () => {
    expect(toQuery("in:#games from:@me has:link quorum", base)).toEqual({
      q: "quorum",
      world: "bubble",
      room: "#bubble/games",
      from: ALICE,
      link: "1",
    });
  });

  it.each([
    ["day", "2026-11-10T12:00:00.000Z"],
    ["week", "2026-11-04T12:00:00.000Z"],
    ["month", "2026-10-12T12:00:00.000Z"],
  ] as const)("asks since a %s ago", (time, since) => {
    expect(toQuery("quorum", { ...base, time })).toEqual({ q: "quorum", world: "bubble", since });
  });

  it("asks with a sender alone and no words, from:@me included", () => {
    expect(toQuery("from:@me", base)).toEqual({ world: "bubble", from: ALICE });
    expect(toQuery("in:#games from:@me", base)).toEqual({ world: "bubble", room: "#bubble/games", from: ALICE });
  });

  it("asks nothing for words too short, other filters alone, or a filter that found nothing", () => {
    expect(toQuery("q", base)).toBeUndefined();
    expect(toQuery("  ", base)).toBeUndefined();
    expect(toQuery("has:link", base)).toBeUndefined();
    expect(toQuery("q from:@me", base)).toBeUndefined();
    expect(toQuery("quorum from:@nobody", base)).toBeUndefined();
  });
});
