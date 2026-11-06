import { describe, expect, it } from "vitest";
import { correlation } from "./testing.ts";

describe("the tests' shared correlation", () => {
  it("reads 1 for values that rise together, -1 for one falling as the other rises, about 0 for none", () => {
    expect(
      correlation([
        [1, 2],
        [2, 4],
        [3, 6],
        [4, 8],
      ]),
    ).toBeCloseTo(1, 12);
    expect(
      correlation([
        [1, 8],
        [2, 6],
        [3, 4],
        [4, 2],
      ]),
    ).toBeCloseTo(-1, 12);
    expect(
      correlation([
        [1, 1],
        [2, -1],
        [3, -1],
        [4, 1],
      ]),
    ).toBeCloseTo(0, 12);
    expect(
      correlation([
        [0, 1],
        [1, 3],
        [2, 2],
      ]),
    ).toBeCloseTo(0.5, 12);
  });

  it("is undefined where either never moves, so no bound passes on it", () => {
    expect(
      correlation([
        [1, 2],
        [1, 3],
        [1, 4],
      ]),
    ).toBeNaN();
    expect(
      correlation([
        [1, 2],
        [2, 2],
        [3, 2],
      ]),
    ).toBeNaN();
    expect(correlation([])).toBeNaN();
  });
});
