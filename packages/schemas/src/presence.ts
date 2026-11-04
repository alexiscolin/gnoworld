// GET /api/presence (slice 7, 7h): who is here in each world a guest may see, counts alone, for the cosmos's labels. A world is named by its
// roles file's slug, as the server's rooms are; the client keys it as the cosmos holds it. Every count is bounded, and nothing else rides.
import { PEOPLE_MOST, PER_HOUR_MOST } from "./counts.ts";
import { HubSlug } from "./slug.ts";

export { HubSlug } from "./slug.ts";
import { z } from "./zod.ts";

/** The most worlds one answer holds. */
export const PRESENCE_ANSWER_MAX = 500;

const People = z
  .number()
  .check(z.refine(Number.isSafeInteger, { message: "a whole number" }), z.gte(0), z.lte(PEOPLE_MOST));

const World = z.strictObject({
  world: HubSlug,
  here: People,
  perHour: z.number().check(z.gte(0), z.lte(PER_HOUR_MOST)),
  rise: z.nullable(z.number().check(z.gte(0), z.lte(PEOPLE_MOST))),
});

export const Presence = z.strictObject({
  worlds: z.array(World).check(
    z.maxLength(PRESENCE_ANSWER_MAX),
    z.refine((worlds) => new Set(worlds.map(({ world }) => world)).size === worlds.length, {
      message: "each world once",
    }),
  ),
});
export type Presence = z.infer<typeof Presence>;

/** The most countries a count may name: every pair of capitals a client's country tag can hold (core's `isCountryCode`). */
export const COUNTRIES_MOST = 26 * 26;

/** The most bytes the people's answer weighs: two counts. */
export const PRESENCE_PEOPLE_MAX_BYTES = 256;

/** GET /api/presence/people (slice 8, 8i; the home's "671 ONLINE"): the people the relay holds in the rooms a guest may see, each once
 * whatever its rooms, and how many countries those of them who declare one name (ADR-0001 §7: opt-in, never detected). Counts alone. */
export const PresencePeople = z.strictObject({
  online: People,
  countries: z
    .number()
    .check(z.refine(Number.isSafeInteger, { message: "a whole number" }), z.gte(0), z.lte(COUNTRIES_MOST)),
});
export type PresencePeople = z.infer<typeof PresencePeople>;

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
