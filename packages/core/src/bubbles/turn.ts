import { centreOf } from "./countries.ts";

/** The facing that puts a country at the middle of the globe (a copy of its centre), or nothing for a code not in the
 * table: the globe does not turn on a guess. The turning is slice 7's. */
export const turnTo = (country: string | undefined): { lat: number; lon: number } | undefined => centreOf(country);
