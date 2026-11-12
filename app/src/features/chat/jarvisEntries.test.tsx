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

  it("stand after the question that asked them, which the room hears a moment after the ask", () => {
    const asked = [line("a", "2026-11-11T10:00:00.000Z"), line("question", "2026-11-11T10:05:00.300Z")];
    expect(order(withJarvis(asked, [card("1", "2026-11-11T10:05:00.000Z")]))).toEqual(["a", "question", "card 1"]);
  });

  it("leave the entries as they are, the same array, when there is none", () => {
    expect(withJarvis(lines, [])).toBe(lines);
  });

  it("stand alone in a room with no line", () => {
    expect(order(withJarvis([], [card("1", "2026-11-11T10:05:00.000Z")]))).toEqual(["card 1"]);
  });

  describe("with the question's own line", () => {
    const said = (id: string, time: string, words: { text: string; account: string }) => ({
      line: { id, time, ...words },
    });
    const asked = (at: string, question: string): JarvisItem => ({
      id: "1",
      room: "#bubble",
      account: "g1me",
      at,
      ask: { question, room: "#bubble" },
    });

    it("a card stands after the asker's line that holds its question, whatever the delay", () => {
      const entries = [
        said("a", "2026-11-11T10:00:00.000Z", { text: "hello", account: "g1you" }),
        said("q", "2026-11-11T10:05:30.000Z", { text: "what is up", account: "g1me" }),
        said("c", "2026-11-11T10:05:31.000Z", { text: "later", account: "g1you" }),
      ];
      expect(order(withJarvis(entries, [asked("2026-11-11T10:05:00.000Z", "what is up")]))).toEqual([
        "a",
        "q",
        "card 1",
        "c",
      ]);
    });

    it("does not take another account's line with the same words for the question", () => {
      const entries = [
        said("x", "2026-11-11T10:05:02.000Z", { text: "what is up", account: "g1you" }),
        said("q", "2026-11-11T10:05:09.000Z", { text: "what is up", account: "g1me" }),
      ];
      expect(order(withJarvis(entries, [asked("2026-11-11T10:05:00.000Z", "what is up")]))).toEqual([
        "x",
        "q",
        "card 1",
      ]);
    });

    it("does not take a line older than the ask for the question", () => {
      const entries = [
        said("old", "2026-11-11T10:00:00.000Z", { text: "what is up", account: "g1me" }),
        said("later", "2026-11-11T10:09:00.000Z", { text: "other", account: "g1you" }),
      ];
      expect(order(withJarvis(entries, [asked("2026-11-11T10:05:00.000Z", "what is up")]))).toEqual([
        "old",
        "card 1",
        "later",
      ]);
    });

    it("falls back to 5 s with no such line", () => {
      const entries = [
        said("x", "2026-11-11T10:05:03.000Z", { text: "near", account: "g1you" }),
        said("y", "2026-11-11T10:05:07.000Z", { text: "far", account: "g1you" }),
      ];
      expect(order(withJarvis(entries, [asked("2026-11-11T10:05:00.000Z", "what is up")]))).toEqual([
        "x",
        "card 1",
        "y",
      ]);
    });
  });
});

// The question's line as the composer sends it, and Jarvis's own line that answers it.
describe("with the question as the room hears it", () => {
  interface Spoken {
    id: string;
    time: string;
    text: string;
    account?: string;
    from?: string;
  }
  const said = (id: string, time: string, text: string): { line: Spoken } => ({
    line: { id, time, text, account: "g1me" },
  });
  const other = (id: string, time: string, text: string): { line: Spoken } => ({
    line: { id, time, text, account: "g1you" },
  });
  const bot = (id: string, time: string): { line: Spoken } => ({
    line: { id, time, text: "It closes today.", from: "jarvis/bot" },
  });
  const asked = (id: string, at: string, question: string): JarvisItem => ({
    id,
    room: "#bubble",
    account: "g1me",
    at,
    ask: { question, room: "#bubble" },
  });
  const done = (item: JarvisItem): JarvisItem => ({
    ...item,
    result: { ok: true, value: { status: "answered", markdown: "x", buttons: [] } },
  });
  const run = (entries: ReturnType<typeof said>[], items: JarvisItem[]) =>
    order(withJarvis(entries as never, items) as never);

  it.each([
    ["the mention in front", "@jarvis what is up"],
    ["trailing spaces", "@jarvis what is up  "],
    ["a line break after the mention", "@jarvis\nwhat is up"],
    ["its words in emphasis", "@jarvis *what is up*"],
  ])("a card stands after the line that holds the question with %s", (_name, text) => {
    const entries = [said("q", "2026-11-11T10:05:20.000Z", text), other("c", "2026-11-11T10:05:21.000Z", "later")];
    expect(run(entries, [asked("1", "2026-11-11T10:05:00.000Z", "what is up")])).toEqual(["q", "card 1", "c"]);
  });

  it("gives two identical questions of one account each their own line", () => {
    const entries = [
      said("q1", "2026-11-11T10:05:02.000Z", "@jarvis what is up"),
      other("x", "2026-11-11T10:05:03.000Z", "between"),
      said("q2", "2026-11-11T10:06:02.000Z", "@jarvis what is up"),
    ];
    const items = [
      asked("1", "2026-11-11T10:05:00.000Z", "what is up"),
      asked("2", "2026-11-11T10:06:00.000Z", "what is up"),
    ];
    expect(run(entries, items)).toEqual(["q1", "card 1", "x", "q2", "card 2"]);
  });

  it("takes a line at the very millisecond of the ask, and none an hour after it", () => {
    const same = [
      said("q", "2026-11-11T10:05:00.000Z", "@jarvis what is up"),
      other("z", "2026-11-11T10:05:30.000Z", "z"),
    ];
    expect(run(same, [asked("1", "2026-11-11T10:05:00.000Z", "what is up")])).toEqual(["q", "card 1", "z"]);
    const late = [
      other("a", "2026-11-11T10:05:03.000Z", "near"),
      said("q", "2026-11-11T11:05:00.000Z", "@jarvis what is up"),
    ];
    expect(run(late, [asked("1", "2026-11-11T10:05:00.000Z", "what is up")])).toEqual(["a", "card 1", "q"]);
  });

  it("hides an answered card once Jarvis's own line follows its question, and no other card", () => {
    const entries = [said("q", "2026-11-11T10:05:02.000Z", "@jarvis what is up"), bot("b", "2026-11-11T10:05:20.000Z")];
    expect(run(entries, [done(asked("1", "2026-11-11T10:05:00.000Z", "what is up"))])).toEqual(["q", "b"]);
    expect(run(entries, [asked("1", "2026-11-11T10:05:00.000Z", "what is up")])).toEqual(["q", "card 1", "b"]);
    const before = [bot("b", "2026-11-11T10:04:00.000Z"), said("q", "2026-11-11T10:05:02.000Z", "@jarvis what is up")];
    expect(run(before, [done(asked("1", "2026-11-11T10:05:00.000Z", "what is up"))])).toEqual(["b", "q", "card 1"]);
    const far = [said("q", "2026-11-11T10:05:02.000Z", "@jarvis what is up"), bot("b", "2026-11-11T11:05:20.000Z")];
    expect(run(far, [done(asked("1", "2026-11-11T10:05:00.000Z", "what is up"))])).toEqual(["q", "card 1", "b"]);
  });
});
