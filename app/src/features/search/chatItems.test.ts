import { shortAddress } from "@gnoworld/schemas";
import { describe, expect, it } from "vitest";
import { peopleItemsOf, roomItemsOf } from "./chatItems.ts";
import { searchPlaces } from "./search.ts";
import { buildIndex } from "./searchIndex.ts";
import { typedGroups } from "./tabs.ts";
import type { SearchItem } from "./types.ts";

// Rooms and people beside the places: the tabs, the marks, the groups, and the items the chat's state gives.
const ME = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const KAI = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const world = (name: string, slug: string, extra: Partial<SearchItem> = {}): SearchItem => ({
  name,
  kind: "world",
  universe: "onyx",
  path: `/w/${slug}`,
  slug,
  world: slug,
  rooms: [`#${slug}`],
  ...extra,
});
const room = (name: string, path: string, extra: Partial<SearchItem> = {}): SearchItem => ({
  name,
  kind: "room",
  universe: "onyx",
  path,
  ...extra,
});
const person = (name: string, path: string): SearchItem => ({ name, kind: "person", universe: "onyx", path });

const ITEMS: SearchItem[] = [
  world("GovDAO", "govdao"),
  world("Builders Hub", "builders"),
  room("govdao/proposals", "/w/govdao?room=proposals", { world: "govdao", here: 21 }),
  room("governance", "/w/govdao?room=governance"),
  room("govdao", "/w/govdao"),
  person("nym-govlover042", "/w/govdao"),
  person("nym-governor777", "/w/govdao"),
  person("kai", "/earth?dm=kai"),
];
const INDEX = buildIndex(ITEMS);
const kinds = (query: string, options?: Parameters<typeof searchPlaces>[2]) =>
  searchPlaces(INDEX, query, options).results.map((r) => r.item.kind);

describe("rooms and people in the index", () => {
  it("a plain word finds the places, then the rooms, then the people, each counted", () => {
    const found = searchPlaces(INDEX, "gov");
    expect(found.results.map((r) => r.item.name)).toEqual([
      "GovDAO",
      "govdao/proposals",
      "governance",
      "nym-govlover042",
      "nym-governor777",
    ]);
    expect(found.counts).toEqual({ places: 1, rooms: 3, people: 2 });
  });

  it("a world's main room is its place's, not a second row of a plain word, but # and the Rooms tab list it", () => {
    expect(searchPlaces(INDEX, "#govdao").results.map((r) => r.note)).toEqual([
      "#govdao · room",
      "#govdao/proposals · room",
    ]);
    const names = searchPlaces(INDEX, "gov", { tab: "rooms" }).results.map((r) => r.item.name);
    expect(names.toSorted()).toEqual(["GovDAO", "govdao/proposals", "governance"]);
  });

  it("each tab keeps its own kind; the counts stay whole", () => {
    expect(kinds("gov", { tab: "people" })).toEqual(["person", "person"]);
    expect(kinds("gov", { tab: "places" })).toEqual(["world"]);
    expect(searchPlaces(INDEX, "gov", { tab: "people" }).counts).toEqual({ places: 1, rooms: 3, people: 2 });
  });

  it("# finds rooms alone; @ finds namespaces and people, never rooms", () => {
    expect(new Set(kinds("#gov"))).toEqual(new Set(["world", "room"]));
    expect(kinds("@nym")).toEqual(["person", "person"]);
  });

  it("a chip or a namespace narrows places, so rooms and people go", () => {
    expect(kinds("gov", { filters: new Set(["worlds"]) })).toEqual(["world"]);
    expect(kinds("gov", { namespace: "gnoswap" })).toEqual([]);
  });

  it("a room listed twice, or as a world's main room, is one", () => {
    const twice = buildIndex([...ITEMS, room("governance", "/w/govdao?room=governance")]);
    expect(searchPlaces(twice, "governance", { tab: "rooms" }).total).toBe(1);
  });

  it("people are found by letters in order, as places are", () => {
    expect(searchPlaces(INDEX, "ngl", { tab: "people" }).results.map((r) => r.item.name)).toEqual(["nym-govlover042"]);
  });
});

describe("typedGroups", () => {
  it("cuts the results by kind, each labelled, the places first, and none empty", () => {
    const groups = typedGroups(searchPlaces(INDEX, "gov").results, true);
    expect(groups.map((g) => [g.id, g.label, g.results.length])).toEqual([
      ["places", "Places", 1],
      ["rooms", "Rooms", 2],
      ["people", "People", 2],
    ]);
  });

  it("holds one group with no label where the words have no kind, or the results hold one alone", () => {
    const labels = (results: ReturnType<typeof searchPlaces>["results"], byKind: boolean) =>
      typedGroups(results, byKind).map((group) => [group.id, group.label, group.results.length]);
    expect(labels(searchPlaces(INDEX, "gov").results, false)).toEqual([["found", "", 5]]);
    expect(labels(searchPlaces(INDEX, "gov", { tab: "people" }).results, true)).toEqual([["found", "", 2]]);
  });
});

describe("the items of the chat's state", () => {
  const sections = [
    {
      name: null,
      rooms: [
        { room: "#bubble", type: "open" as const, here: 3 },
        { room: "#bubble/games", type: "open" as const, here: 2, messages: 48 },
        { room: "#nowhere/x", type: "open" as const },
      ],
    },
  ];

  it("lists a room with its page, its people and its lines, in words; a room with no page is left", () => {
    const followed = { "#bubble/games": { members: [], topic: "Play here" } };
    const items = roomItemsOf(sections, followed, () => "Bubble");
    expect(items).toMatchObject([
      { name: "bubble", path: "/w/bubble", here: 3, description: "in Bubble" },
      {
        name: "bubble/games",
        kind: "room",
        path: "/w/bubble?room=games",
        world: "bubble",
        here: 2,
        messages: 48,
        place: "Bubble",
        topic: "Play here",
        description: "in Bubble · Play here",
      },
    ]);
  });

  it("says only the world when the room has no topic, and nothing when none listed", () => {
    expect(roomItemsOf(sections, {}, () => "Bubble")[1]?.description).toBe("in Bubble");
    expect(roomItemsOf(undefined, {}, () => undefined)).toEqual([]);
  });

  it("counts a followed room's members, the bot left out, where the server lists none", () => {
    const listed = [{ name: null, rooms: [{ room: "#bubble/games", type: "open" as const }] }];
    const followed = { "#bubble/games": { members: ["gnoworld", "kai", "bob"], topic: undefined } };
    expect(roomItemsOf(listed, followed, () => undefined)[0]?.here).toBe(2);
  });

  it("lists each person once: an account opens its direct message, a guest the room it is in; never the bot nor oneself", () => {
    const rooms = {
      "#bubble": { members: ["gnoworld", ME, KAI, "guest42"] },
      "#bubble/games": { members: [KAI] },
    };
    const items = peopleItemsOf(rooms, [], ME);
    expect(items.map((i) => [i.kind, i.path, i.description])).toEqual([
      ["person", `/earth?dm=${KAI}`, "in #bubble now"],
      ["person", "/w/bubble", "in #bubble now"],
    ]);
    expect(items[0]?.name).toBe(shortAddress(KAI));
  });

  it("lists those the reader wrote to, who are in no followed room", () => {
    const items = peopleItemsOf({}, [KAI], ME);
    expect(items.map((i) => [i.path, i.description])).toEqual([[`/earth?dm=${KAI}`, "direct messages"]]);
  });

  it("offers a reader signed out no message: an account's person leads to the room it is in", () => {
    const rooms = { "#bubble": { members: [KAI, "guest42"] } };
    expect(peopleItemsOf(rooms, [], undefined).map((i) => i.path)).toEqual(["/w/bubble", "/w/bubble"]);
  });
});
