import { describe, expect, it } from "vitest";
import { pieces } from "./marks.ts";

// A hit's snippet cut into what is marked and what is not: the server gives offsets (UTF-16 units) into the text, which the page draws as
// text, never as markup. A mark that does not sit in the text marks nothing (the client refuses such an answer; this is the second guard).
describe("a snippet's marked pieces", () => {
  it("cuts the text at each mark, in order, the marked words flagged", () => {
    expect(pieces("the quorum stays", [[4, 10]])).toMatchObject([
      { text: "the ", marked: false },
      { text: "quorum", marked: true },
      { text: " stays", marked: false },
    ]);
  });

  it("starts and ends with a mark without an empty piece", () => {
    expect(
      pieces("quorum far", [
        [0, 6],
        [7, 10],
      ]),
    ).toMatchObject([
      { text: "quorum", marked: true },
      { text: " ", marked: false },
      { text: "far", marked: true },
    ]);
  });

  it("is the whole text unmarked when there is no mark", () => {
    expect(pieces("nothing here", [])).toMatchObject([{ text: "nothing here", marked: false }]);
  });

  it("says where each piece starts", () => {
    expect(pieces("the quorum stays", [[4, 10]]).map(({ at }) => at)).toEqual([0, 4, 10]);
  });

  it("keeps markup as plain text", () => {
    expect(pieces("<b>quorum</b>", [[3, 9]])).toMatchObject([
      { text: "<b>", marked: false },
      { text: "quorum", marked: true },
      { text: "</b>", marked: false },
    ]);
  });

  it("marks nothing when a mark lies outside the text or out of order", () => {
    expect(pieces("abc", [[1, 9]])).toMatchObject([{ text: "abc", marked: false }]);
    expect(
      pieces("abcdef", [
        [3, 5],
        [0, 1],
      ]),
    ).toMatchObject([{ text: "abcdef", marked: false }]);
  });

  it("counts in UTF-16 units, as the server does: an emoji is two", () => {
    expect(pieces("😀 quorum", [[3, 9]])).toMatchObject([
      { text: "😀 ", marked: false },
      { text: "quorum", marked: true },
    ]);
  });
});
