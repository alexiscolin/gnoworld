import { describe, expect, it } from "vitest";
import { liveLine } from "./liveLine.ts";

// The phone sheet's one line of what is live: who talks, who is here, how many countries, said as words, never a lone figure.
describe("the live line", () => {
  it("says nobody talking rather than a zero figure, and who is here", () => {
    expect(liveLine({ talking: 0, here: 1, countries: 0 })).toBe("Nobody talking now · 1 here");
  });

  it("counts those talking, those here and the countries, singular and plural", () => {
    expect(liveLine({ talking: 3, here: 12, countries: 4 })).toBe("3 talking now · 12 here · 4 countries");
    expect(liveLine({ talking: 1, here: 1, countries: 1 })).toBe("1 talking now · 1 here · 1 country");
  });

  it("leaves out what it is not told or what is empty", () => {
    expect(liveLine({ talking: undefined, here: 0, countries: 0 })).toBe("");
    expect(liveLine({ talking: 2, here: undefined, countries: undefined })).toBe("2 talking now");
  });
});
