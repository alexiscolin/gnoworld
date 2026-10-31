import { describe, expect, it } from "vitest";
import { centreOf, COUNTRIES } from "./countries.ts";
import { isFarSide } from "./farSide.ts";
import { turnTo } from "./turn.ts";

// Slice 6's 6b: "the globe turns to your own message" (backlog row 6), the choice only: which facing puts the speaker's
// country at the centre. The turning itself is slice 7's 7f.
describe("turnTo", () => {
  it("gives the centre of the country: the facing that puts it in the middle of the globe", () => {
    expect(turnTo("JP")).toEqual(centreOf("JP"));
    expect(turnTo("BR")).toEqual(centreOf("BR"));
  });

  it("leaves every country on the near side of its own facing", () => {
    for (const { code, lat, lon } of COUNTRIES) {
      const facing = turnTo(code);
      expect(facing, code).toBeDefined();
      if (facing !== undefined) expect(isFarSide({ lat, lon }, facing), code).toBe(false);
    }
  });

  it("gives nothing, and so does not turn, for no country or a code it cannot read, never a guess", () => {
    for (const code of [undefined, "", "jp", "JPN", "XX", "ZZ", " JP", "constructor"])
      expect(turnTo(code), String(code)).toBeUndefined();
  });

  it("gives a copy: changing it leaves the table as it was", () => {
    const facing = turnTo("JP");
    if (facing === undefined) throw new Error("JP is in the table");
    const before = { ...facing };
    (facing as { lat: number }).lat = 0;
    expect(turnTo("JP")).toEqual(before);
  });
});
