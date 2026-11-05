// The server's first signals (slice 9h, D210 to D219): who charted a world first and who spoke first. A signal names its
// account by address alone (D212): a name is never part of what travels, so none can carry markup.
import { Address } from "./address.ts";
import { Slug } from "./slug.ts";
import { Time } from "./pins.ts";
import { z } from "./zod.ts";

/** A first of a world: `chart` the first logged-in account to open it, `words` the first line that passed moderation. */
export const Signal = z.strictObject({
  kind: z.enum(["chart", "words"]),
  world: Slug,
  account: Address,
  at: Time,
});
export type Signal = z.infer<typeof Signal>;

/** What a page sends to chart a world: the world alone, never an account (the session says who). */
export const ChartRequest = z.strictObject({ world: Slug });
export type ChartRequest = z.infer<typeof ChartRequest>;

/** The answer to a chart call: the world, and whether this call was the first. */
export const ChartAnswer = z.strictObject({ world: Slug, first: z.boolean() });
export type ChartAnswer = z.infer<typeof ChartAnswer>;
