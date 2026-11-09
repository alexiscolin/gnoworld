import type { ShownLine } from "@gnoworld/core";
import { describe, expect, it } from "vitest";
import type { ChainHeard } from "../../store/chain.ts";
import { groupedOf } from "./lineMarks.ts";

const at = (minutes: number, day = "2026-11-07") => `${day}T10:${String(minutes).padStart(2, "0")}:00.000Z`;
const line = (id: string, minutes: number, over: Partial<ShownLine> = {}) => ({
  line: { id, time: at(minutes), from: "ines", account: "g1ines", text: id, kind: "message" as const, ...over },
});
const guest = (id: string, minutes: number) => ({
  line: { id, time: at(minutes), from: "ines", text: id, kind: "message" as const },
});
const call = { call: { id: "c1" } as ChainHeard, key: "c1" };

describe("the lines that go on a group", () => {
  it("are the same author's, within five minutes of the line before", () => {
    expect([...groupedOf([line("a", 0), line("b", 4), line("c", 8), line("d", 20)])]).toEqual(["b", "c"]);
  });

  it("start again for another author, a guest of the same nick, a reply, a notice or a call of the chain", () => {
    expect([
      ...groupedOf([line("a", 0), line("b", 1, { account: "g1bob" }), line("c", 2, { account: "g1bob", from: "bob" })]),
    ]).toEqual(["c"]);
    expect([...groupedOf([line("a", 0), guest("b", 1)])]).toEqual([]);
    expect([...groupedOf([line("a", 0), line("b", 1, { reply: "a" }), line("c", 2)])]).toEqual(["c"]);
    expect([...groupedOf([line("a", 0), line("b", 1, { kind: "notice" }), line("c", 2)])]).toEqual([]);
    expect([...groupedOf([line("a", 0), call, line("b", 1)])]).toEqual([]);
  });

  it("start again on the next day, the reader's own", () => {
    const local = (day: number, minutes: number) =>
      new Date(2026, 10, day, minutes === 59 ? 23 : 0, minutes).toISOString();
    expect([...groupedOf([line("a", 0, { time: local(7, 59) }), line("b", 0, { time: local(8, 1) })])]).toEqual([]);
    expect([...groupedOf([line("a", 0, { time: local(8, 0) }), line("b", 0, { time: local(8, 1) })])]).toEqual(["b"]);
  });
});
