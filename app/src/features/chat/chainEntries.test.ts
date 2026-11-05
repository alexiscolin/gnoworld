import { Address } from "@gnoworld/schemas";
import { describe, expect, it } from "vitest";
import type { ChainHeard } from "../../store/chain.ts";
import type { ChainPlace } from "./chainThread.ts";
import { callsIn, interleave } from "./chainEntries.ts";

// Slice 9g (frames 20 to 35): the calls the chain told are drawn in the thread of the world's main room, among its messages, by the
// time each was heard; another room, or another universe's call, draws none.
const ALICE = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const call = (height: number, at: string, universe = "onyx"): ChainHeard => ({
  id: `h${String(height)}:0`,
  kind: "call",
  universe,
  world: "govdao",
  realm: "gno.land/r/gov/dao",
  func: "MustVoteOnProposal",
  actor: ALICE,
  height,
  at,
});
const place: ChainPlace = { slug: "govdao", universe: "onyx" };
const line = (id: string, time: string) => ({ id, time });
const ids = (entries: ReturnType<typeof interleave<{ id: string; time: string }>>) =>
  entries.map((entry) => ("line" in entry ? entry.line.id : String(entry.call.height)));

describe("the calls a room draws", () => {
  it("are the world's main room's alone: another room of the world, or none, draws none", () => {
    const value = [call(1, "2026-11-06T09:00:00.000Z")];
    expect(callsIn(value, place, "#govdao")).toHaveLength(1);
    expect(callsIn(value, place, "#govdao/crew")).toEqual([]);
    expect(callsIn(value, place, "#bubble")).toEqual([]);
    expect(callsIn(value, place, undefined)).toEqual([]);
    expect(callsIn(value, undefined, "#govdao")).toEqual([]);
  });

  it("are the page's universe's alone, whatever the world's name", () => {
    const value = [call(1, "2026-11-06T09:00:00.000Z", "gnoland"), call(2, "2026-11-06T09:00:01.000Z")];
    expect(callsIn(value, place, "#govdao").map(({ height }) => height)).toEqual([2]);
  });

  it("are the newest 20 at most", () => {
    const value = Array.from({ length: 50 }, (_, n) => call(n, `2026-11-06T09:00:${String(n).padStart(2, "0")}.000Z`));
    const shown = callsIn(value, place, "#govdao");
    expect(shown).toHaveLength(20);
    expect(shown[0]?.height).toBe(30);
    expect(shown[19]?.height).toBe(49);
  });
});

describe("a call's key", () => {
  it("is the event's own id: one actor calling the same function twice in a block is two keys", () => {
    const at = "2026-11-06T09:00:00.000Z";
    const twice = [
      { ...call(7, at), id: "tx:0" },
      { ...call(7, at), id: "tx:1" },
    ];
    const keys = interleave([], twice).map((entry) => ("call" in entry ? entry.key : ""));
    expect(keys).toEqual(["tx:0", "tx:1"]);
  });
});

describe("the lines and the calls in one thread", () => {
  const lines = [line("a", "2026-11-06T09:00:00.000Z"), line("b", "2026-11-06T09:02:00.000Z")];

  it("stand by time: a call heard between two lines is between them, one before all first, one after all last", () => {
    const calls = [
      call(1, "2026-11-06T08:59:00.000Z"),
      call(2, "2026-11-06T09:01:00.000Z"),
      call(3, "2026-11-06T09:03:00.000Z"),
    ];
    expect(ids(interleave(lines, calls))).toEqual(["1", "a", "2", "b", "3"]);
  });

  it("keep a call heard at a line's own time after that line, and the calls' own order", () => {
    const calls = [call(1, "2026-11-06T09:00:00.000Z"), call(2, "2026-11-06T09:00:00.000Z")];
    expect(ids(interleave(lines, calls))).toEqual(["a", "1", "2", "b"]);
  });

  it("are the lines alone with no call, and the calls alone with no line", () => {
    expect(ids(interleave(lines, []))).toEqual(["a", "b"]);
    expect(ids(interleave([], [call(1, "2026-11-06T09:00:00.000Z")]))).toEqual(["1"]);
  });
});
