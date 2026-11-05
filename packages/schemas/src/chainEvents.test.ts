import { describe, expect, it } from "vitest";
import { ChainEvent, RealmsDeployed } from "./chainEvents.ts";
import * as indexer from "./indexer.ts";

// Slice 9g (D260 to D269): what the server tells a page of the chain, through the stream's own events `chain` and `realms`.
// Every text is a name the chain's own rules bound (an address, a realm's path, a function's name), and no text of a
// transaction's args or memo ever travels: what a stranger wrote reaches a room as bounded names or not at all.
const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const CALL = {
  kind: "call",
  universe: "onyx",
  world: "govdao",
  realm: "gno.land/r/gov/dao",
  func: "MustVoteOnProposal",
  actor: ALICE,
  height: 900030,
};
const DEPLOY = {
  kind: "deploy",
  universe: "onyx",
  realm: "gno.land/r/g1zdyqzhwsg2ayg9rjh8txhgm42ntu0aajda6x7y/smoke/s5f26c0fe/counter",
  actor: ALICE,
  height: 887427,
};
const bidi = String.fromCodePoint(0x202e);

describe("a chain event", () => {
  it("takes a call to a world's realm, and a deploy that names no world, and is read through the indexer's path, which keeps it out of the first screen", () => {
    expect(ChainEvent.parse(CALL)).toEqual(CALL);
    expect(ChainEvent.parse(DEPLOY)).toEqual(DEPLOY);
    expect(indexer.ChainEvent).toBe(ChainEvent);
    expect(indexer.RealmsDeployed).toBe(RealmsDeployed);
  });

  it.each([
    ["markup in a function's name", { ...CALL, func: "Vote<img src=x onerror=alert(1)>" }],
    ["a bidi override in a function's name", { ...CALL, func: `Vote${bidi}` }],
    ["a function's name of 10 KB", { ...CALL, func: "A".repeat(10_000) }],
    ["a function's name past 64 characters", { ...CALL, func: "A".repeat(65) }],
    ["a realm's path of 10 KB", { ...CALL, realm: `gno.land/r/${"a".repeat(10_000)}` }],
    ["a realm's path with markup", { ...CALL, realm: "gno.land/r/<b>x</b>" }],
    ["a path that is no realm's (a pure package)", { ...DEPLOY, realm: "gno.land/p/demo/avl" }],
    ["an actor that is no address", { ...CALL, actor: "<script>" }],
    ["an unknown kind", { ...CALL, kind: "vote" }],
    ["a world that is no slug", { ...CALL, world: "Gov DAO" }],
    ["a height that is negative", { ...CALL, height: -1 }],
    ["a height that is not whole", { ...CALL, height: 1.5 }],
    ["a height as text", { ...CALL, height: "900030" }],
    ["no height", { ...CALL, height: undefined }],
    ["a field more (the args, the memo)", { ...CALL, args: ["x"] }],
  ])("refuses %s", (_, event) => {
    expect(ChainEvent.safeParse(event).success).toBe(false);
  });

  // The caps' own edges (red pass): one past is refused and the edge itself is not, so a cap moved either way fails. The
  // realm's cap (256) is the chain event's own, not RealmPath's 128 (data.ts): a path deployed under an address and nested
  // names is longer than a world's data holds, and a deploy shows what the chain accepted.
  it("takes a function of 64 characters and a realm's path of 256, and refuses one more of each", () => {
    expect(ChainEvent.safeParse({ ...CALL, func: "A".repeat(64) }).success).toBe(true);
    expect(ChainEvent.safeParse({ ...CALL, func: "A".repeat(65) }).success).toBe(false);
    const path = (length: number) => `gno.land/r/${"a".repeat(length - "gno.land/r/".length)}`;
    expect(ChainEvent.safeParse({ ...DEPLOY, realm: path(256) }).success).toBe(true);
    expect(ChainEvent.safeParse({ ...DEPLOY, realm: path(257) }).success).toBe(false);
  });

  it("refuses a call that names no function", () => {
    expect(ChainEvent.safeParse({ ...CALL, func: undefined }).success).toBe(false);
  });
});

describe("the count of realms deployed in 24 hours", () => {
  const COUNT = { universe: "onyx", count: 17, height: 908297 };

  it("takes a universe, a whole count and the block height it stood at", () => {
    expect(RealmsDeployed.parse(COUNT)).toEqual(COUNT);
    expect(RealmsDeployed.parse({ ...COUNT, count: 0 })).toEqual({ ...COUNT, count: 0 });
  });

  it.each([
    ["a negative count", { ...COUNT, count: -1 }],
    ["a count that is not whole", { ...COUNT, count: 2.5 }],
    ["a count as text", { ...COUNT, count: "17" }],
    ["no height", { universe: "onyx", count: 1 }],
    ["a universe that is no slug", { ...COUNT, universe: "On yx" }],
    ["a field more", { ...COUNT, at: "2026-11-05T05:00:00.000Z" }],
  ])("refuses %s", (_, value) => {
    expect(RealmsDeployed.safeParse(value).success).toBe(false);
  });
});
