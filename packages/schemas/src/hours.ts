// A world's last day of messages an hour (slice 8, 8g), as GET /api/presence/hours answers it: counts alone. A file of its own, so a plate's
// read carries no other answer's schema.
import { PER_HOUR_MOST } from "./counts.ts";
import { z } from "./zod.ts";

/** The hours a world's activity covers: the last day, the current hour last. */
export const PRESENCE_HOURS = 24;

/** The most bytes the hours' answer weighs: 24 counts at their cap, a time and a rate. */
export const PRESENCE_HOURS_MAX_BYTES = 1024;

const Rate = z.number().check(z.gte(0), z.lte(PER_HOUR_MOST));

/** GET /api/presence/hours?world= (slice 8, 8g; a plate's "ACTIVITY · LAST 24 H", frames 26 and 40): a world's messages an hour, its
 * busiest sample of each of the last 24 hours, oldest first, from the hour `from` (milliseconds since 1970, on the hour), with its pace now.
 * An hour no sample read is null, never a zero; a world never read has no hours. Counts alone. */
export const PresenceHours = z.strictObject({
  from: z.number().check(z.refine((at) => Number.isSafeInteger(at) && at >= 0 && at % 3_600_000 === 0, "an hour")),
  hours: z.array(z.nullable(Rate)).check(z.refine((hours) => hours.length === 0 || hours.length === PRESENCE_HOURS)),
  now: z.nullable(Rate),
});
export type PresenceHours = z.infer<typeof PresenceHours>;
