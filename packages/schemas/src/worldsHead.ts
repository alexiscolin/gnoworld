// What the worlds' file shares with its count (7n2): the caps of a file, the universe's slug and the time of the read. Apart from worlds.ts,
// so a page that reads only the count takes none of the file's schema: a bundler puts a module whole in one chunk.
import { z } from "./zod.ts";

/** What one file may hold. A world's name and a text are at most `name` characters. */
export const WORLDS_CAPS = { worlds: 20_000, realms: 512, functions: 256, imports: 256, name: 128, path: 256 } as const;

/** A universe or a namespace: 1 to 128 lower-case letters, digits, `_` and `-`, from a letter or a digit. */
export const Slug = z.string().check(z.minLength(1), z.maxLength(WORLDS_CAPS.name), z.regex(/^[a-z0-9][a-z0-9_-]*$/));
/** A time the job read or saw, with its offset. */
export const Moment = z.iso.datetime({ offset: true }).check(z.maxLength(40));

/** The most bytes of the worlds' count: its head and a number, under 300; a client refuses more. */
export const WORLDS_COUNT_MAX_BYTES = 1024;

/** worlds-count.json (7n2), written with worlds.json in the same pass: its head and the worlds the cosmos draws from it with the Earth (core's
 * `worldsDrawn`), so the home's hero reads a few bytes for its number and a phone nothing of the cosmos before View in space. */
export const WorldsCount = z.strictObject({
  version: z.literal(1),
  universe: Slug,
  updated: Moment,
  count: z
    .number()
    .check(z.refine(Number.isSafeInteger, { message: "a whole number" }), z.gte(1), z.lte(WORLDS_CAPS.worlds + 1)),
});
export type WorldsCount = z.infer<typeof WorldsCount>;
