// GET /api/presence (slice 7, 7h): who is here in each world a guest may see, counts alone, for the cosmos's labels. A world is named by its
// roles file's slug, as the server's rooms are; the client keys it as the cosmos holds it. Every count is bounded, and nothing else rides.
import { z } from "./zod.ts";

/** The most worlds one answer holds. */
export const PRESENCE_ANSWER_MAX = 500;
const PEOPLE_MOST = 1_000_000;
const PER_HOUR_MOST = 10_000_000;

const People = z
  .number()
  .check(z.refine(Number.isSafeInteger, { message: "a whole number" }), z.gte(0), z.lte(PEOPLE_MOST));

const World = z.strictObject({
  world: z.string().check(z.maxLength(64), z.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)),
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
