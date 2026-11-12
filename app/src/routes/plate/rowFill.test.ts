import { describe, expect, it } from "vitest";
import { rowFill } from "./rowFill.ts";

const spans = (count: number) => Array.from({ length: count }, (_, at) => rowFill(at, count).span);
const narrows = (count: number) => Array.from({ length: count }, (_, at) => rowFill(at, count).narrow);

describe("rowFill", () => {
  it("puts four to a row and lets a last row's squares share its whole width", () => {
    expect(spans(4)).toEqual([3, 3, 3, 3]);
    expect(spans(5)).toEqual([3, 3, 3, 3, 12]);
    expect(spans(6)).toEqual([3, 3, 3, 3, 6, 6]);
    expect(spans(7)).toEqual([3, 3, 3, 3, 4, 4, 4]);
    expect(spans(3)).toEqual([4, 4, 4]);
    expect(spans(1)).toEqual([12]);
  });

  it("keeps two to a row on a narrow plate, an odd last square taking the whole row", () => {
    expect(narrows(4)).toEqual([true, true, true, true]);
    expect(narrows(5)).toEqual([true, true, true, true, false]);
  });
});
