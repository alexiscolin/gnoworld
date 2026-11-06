// The status ring (ADR-0002 §1, "Status ring"; the decision of 2026-10-31): a tilted orbit whose small moon, on its front half, marks what a
// realm reports. The half runs from the orbit's left end (an angle of π) past the eye to its right end (0): the arc up to the moon is lit, a
// mark stands at the threshold where the realm states one; an open proposal's no is lit from the right end (F4308). A share the realm sent
// out of range is held to the half; no number is nothing lit.
import { share } from "../planet/gauges.ts";

export interface StatusOrbit {
  /** Where the moon stands, in radians round the orbit. */
  readonly moon: number;
  /** Where the no's arc ends, from the right end, when the realm states its no. */
  readonly against?: number;
  /** Where the threshold's mark stands, when the realm states one. */
  readonly mark?: number;
}

const placeOf = (part: number) => Math.PI * (1 - share(part));

/** The orbit's moon for a `lit` share, the no's arc for an `against` share and the mark for a `mark` threshold, each 0 to 1 and each but
 * the first only when the realm states it. */
export const statusOrbit = ({
  lit,
  against,
  mark,
}: {
  readonly lit: number;
  readonly against?: number | undefined;
  readonly mark?: number | undefined;
}): StatusOrbit => ({
  moon: placeOf(lit),
  ...(against === undefined ? {} : { against: Math.PI * share(against) }),
  ...(mark === undefined ? {} : { mark: placeOf(mark) }),
});
