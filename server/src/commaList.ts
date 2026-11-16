import { z } from "zod";

/** A query's comma-separated list: 1 to `max` items, each read by `item` (so a missing, empty or too long list is refused whole). */
export const commaList = <Out>(item: z.core.$ZodType<Out, string>, max: number): z.ZodType<Out[], string> =>
  z
    .string()
    .transform((list) => list.split(","))
    .pipe(z.array(item).min(1).max(max));
