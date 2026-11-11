import { describe, expect, it } from "vitest";
import { snippetOf } from "./snippet.ts";

// Slice 13, B2: a hit's text cut to 240 characters around the first word found, the words' ranges as offsets into that text.
const slice = (text: string, marks: [number, number][]): string[] => marks.map(([from, to]) => text.slice(from, to));

describe("snippetOf, the words found", () => {
  it("marks a word, and a prefix of a longer word", () => {
    const hit = snippetOf("say alphabet now", "alph");
    expect(hit).toEqual({ text: "say alphabet now", marks: [[4, 12]] });
  });

  it("marks a word at the very end of the text", () => {
    expect(snippetOf("say alpha", "alpha").marks).toEqual([[4, 9]]);
  });

  it("takes a word of under three characters for a whole token, not a prefix", () => {
    expect(snippetOf("abc ab", "ab").marks).toEqual([[4, 6]]);
  });

  it("folds case and accents as the index does, and no further", () => {
    expect(snippetOf("Été chaud", "ete").marks).toEqual([[0, 3]]);
    expect(snippetOf("Straße", "strasse").marks).toEqual([]);
  });

  it("gives the marks sorted, whatever the order of the words typed", () => {
    const text = "alpha beta gamma";
    const { marks } = snippetOf(text, "gamma alpha beta");
    expect(slice(text, marks)).toEqual(["alpha", "beta", "gamma"]);
  });

  it("gives one mark for two words that name one token", () => {
    expect(snippetOf("alpha", "alp alpha").marks).toEqual([[0, 5]]);
  });

  it("gives no mark for no word found, in a short text and in a long one", () => {
    expect(snippetOf("nothing", "zzz").marks).toEqual([]);
    const long = "a ".repeat(200);
    expect(snippetOf(long, "zzz")).toEqual({ text: long.slice(0, 240), marks: [] });
  });
});

describe("snippetOf, the cut at 240 characters", () => {
  it("leaves a text of 240 characters whole, and cuts one of 241", () => {
    const whole = "needle ".padEnd(240, ".");
    expect(snippetOf(whole, "needle").text).toBe(whole);
    expect(snippetOf(`${whole}.`, "needle").text).toHaveLength(240);
  });

  it("leaves a lone surrogate at the ends of a text of 240 characters", () => {
    const text = `\udc00${"a".repeat(238)}\ud800`;
    expect(snippetOf(text, "a").text).toBe(text);
  });

  it("starts 60 characters before the first word", () => {
    const text = `${"-".repeat(100)}needle${"-".repeat(300)}`;
    const hit = snippetOf(text, "needle");
    expect(hit.text).toBe(text.slice(40, 280));
    expect(hit.marks).toEqual([[60, 66]]);
  });

  it("keeps a full 240 characters for a word near the end", () => {
    const text = `${"-".repeat(390)}needle`;
    const hit = snippetOf(text, "needle");
    expect(hit.text).toBe(text.slice(156));
    expect(hit.marks).toEqual([[234, 240]]);
  });

  it("drops the marks that do not fit the cut, keeps those that do", () => {
    const text = `needle${"-".repeat(300)}needle`;
    const hit = snippetOf(text, "needle");
    expect(hit.text).toHaveLength(240);
    expect(hit.marks).toEqual([[0, 6]]);
  });

  it("never starts on the second half of a pair", () => {
    const text = `${"😀".repeat(30)} target ${"z".repeat(300)}`;
    const hit = snippetOf(text, "target");
    expect(hit.text).toBe(text.slice(2, 241));
    expect(hit.marks).toEqual([[59, 65]]);
  });

  it("never ends on the first half of a pair", () => {
    const text = `needle ${".".repeat(232)}😀${"b".repeat(100)}`;
    const hit = snippetOf(text, "needle");
    expect(hit.text).toBe(text.slice(0, 239));
    expect(hit.marks).toEqual([[0, 6]]);
  });
});
