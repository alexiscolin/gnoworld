import { describe, expect, it } from "vitest";
import type { JarvisItem } from "../../jarvisHere.ts";
import { withJarvis } from "./jarvisEntries.tsx";

// 10u-a: Jarvis's cards stand among a room's lines where and when they were asked.
const line = (id: string, time: string) => ({ line: { id, time } });
const card = (id: string, at: string): JarvisItem => ({ id, room: "#bubble", account: "g1me", at });
const order = (entries: ReturnType<typeof withJarvis<{ id: string; time: string }>>) =>
  entries.map((entry) => ("jarvis" in entry ? `card ${entry.jarvis.id}` : "line" in entry ? entry.line.id : "call"));

describe("Jarvis's cards among the lines", () => {
  const lines = [line("a", "2026-11-11T10:00:00.000Z"), line("b", "2026-11-11T10:10:00.000Z")];

  it("stand before the first line newer than their ask, and after the last", () => {
    const placed = withJarvis(lines, [card("1", "2026-11-11T10:05:00.000Z"), card("2", "2026-11-11T10:20:00.000Z")]);
    expect(order(placed)).toEqual(["a", "card 1", "b", "card 2"]);
  });

  it("are ordered by their ask whatever order they are given in, each with its own key", () => {
    const placed = withJarvis(lines, [card("2", "2026-11-11T10:06:00.000Z"), card("1", "2026-11-11T10:05:00.000Z")]);
    expect(order(placed)).toEqual(["a", "card 1", "card 2", "b"]);
    const keys = placed.flatMap((entry) => ("key" in entry ? [entry.key] : []));
    expect(new Set(keys).size).toBe(2);
  });

  it("leave the entries as they are, the same array, when there is none", () => {
    expect(withJarvis(lines, [])).toBe(lines);
  });

  it("stand alone in a room with no line", () => {
    expect(order(withJarvis([], [card("1", "2026-11-11T10:05:00.000Z")]))).toEqual(["card 1"]);
  });
});
