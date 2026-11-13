// A plate's hours (8g): the world's chat hours, asked once the page runs; the read is a chunk of its own (hours.ts).
import type { PresenceHours } from "@gnoworld/schemas/indexer";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { queryClient } from "../../lib/query/client.ts";
import { keys } from "../../lib/query/keys.ts";

export type Hours = PresenceHours;

// The reader comes in a chunk of its own, asked as the query runs; a file that did not come whole is no answer.
const hoursOptions = (world: string) =>
  queryOptions({
    queryKey: keys.hours(world),
    queryFn: ({ signal }) => import("./hours.ts").then(({ readHours }) => readHours(world, signal)),
  });

/** The hours of `world` (as who is here names it) once read; undefined while they come or when the server gave none. */
export const useHours = (world: string): Hours | undefined => useQuery(hoursOptions(world), queryClient).data;
