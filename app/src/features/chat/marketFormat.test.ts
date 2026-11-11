import { describe, expect, it } from "vitest";
import { directionOf, dollars, tenthsOf } from "./marketFormat.ts";

// The prices as frame 6 wrote them, restored from the home's old row (its tests, as plain calls).
describe("the market card's formats", () => {
  it.each([
    [67123.456, "67,123"],
    [1000, "1,000"],
    [999.999, "1,000.00"],
    [1.2345, "1.23"],
    [1, "1.00"],
    [0.4321, "0.432"],
    [0.0099, "0.0099"],
    [0.01, "0.01"],
    [0.000123, "0.000123"],
    [1.234e-9, "0.00000000123"],
  ])("writes %s as %s", (usd, wanted) => {
    expect(dollars(usd)).toBe(wanted);
  });

  it("never writes a positive price as zero", () => {
    expect(dollars(1e-12)).not.toMatch(/^0(\.0+)?$/);
  });

  it.each([
    [null, null],
    [2.54, 2.5],
    [-1.25, -1.2],
    [0.04, 0],
    [-0.06, -0.1],
  ])("rounds a change of %s to %s", (percent, wanted) => {
    expect(tenthsOf(percent)).toBe(wanted === 0 ? 0 : wanted);
  });

  it("calls a rise up, a fall down, and none or a rounded zero flat", () => {
    expect([directionOf(2.5), directionOf(-0.1), directionOf(0), directionOf(null)]).toEqual([
      "up",
      "down",
      "flat",
      "flat",
    ]);
  });
});
