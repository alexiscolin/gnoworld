// Who is here now in each world, by its roles file's slug, as the server counts it: one query for the whole page, however many components ask (the
// search, the bell's panel, a world's plate and the header's Earth share it), asked again each minute while one holds it and the tab is shown; none
// until it answers, or if it does not. A component that asks with `open` false reads nothing.
import type { Presence } from "@gnoworld/schemas/indexer";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "./lib/query/client.ts";
import { presenceOptions } from "./lib/query/apiReads.ts";

const NONE: ReadonlyMap<string, number> = new Map();
const mapOf = ({ worlds }: Presence): ReadonlyMap<string, number> =>
  new Map(worlds.map(({ world, here }) => [world, here]));

/** Who is here in the world `slug` now, from the page's one reading (a component holds it with `useHere`): none until it answers. */
export const presentIn = (slug: string): number | undefined =>
  queryClient.getQueryData(presenceOptions.queryKey)?.worlds.find(({ world }) => world === slug)?.here;

export function useHere(open: boolean): ReadonlyMap<string, number> {
  return useQuery({ ...presenceOptions, enabled: open, select: mapOf }, queryClient).data ?? NONE;
}
