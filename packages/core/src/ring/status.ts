// The status ring (ADR-0002 §1, "Status ring"; the decision of 2026-10-31): a tilted orbit whose small moon, on its front half, marks what a
// realm reports. The half runs from the orbit's left end (an angle of π) past the eye to its right end (0): the arc up to the moon is lit, a
// mark stands at the threshold. A share the realm sent out of range is held to the half; no number is nothing lit.
import { share } from "../planet/gauges.ts";

export interface StatusOrbit {
  /** Where the moon stands, in radians round the orbit. */
  readonly moon: number;
  /** Where the threshold's mark stands. */
  readonly mark: number;
}

const placeOf = (part: number) => Math.PI * (1 - share(part));

/** The orbit's moon and mark for a `lit` share against a `mark` threshold, both 0 to 1. */
export const statusOrbit = ({ lit, mark }: { readonly lit: number; readonly mark: number }): StatusOrbit => ({
  moon: placeOf(lit),
  mark: placeOf(mark),
});
