import { describe, expect, it } from "vitest";
import { lastWord } from "./complete.ts";

// What the suggestions are made of is composer/suggest.test.ts; this is the word they are made for.
describe("the draft's last word", () => {
  it.each([
    ["", 0, ""],
    ["hello", 0, "hello"],
    ["see #gno", 4, "#gno"],
    ["hi @", 3, "@"],
    ["two  spaces ", 12, ""],
    ["line\n/m", 5, "/m"],
  ])("is, of %j, from %i: %j", (text, start, word) => {
    expect(lastWord(text)).toEqual({ start, word });
  });
});
