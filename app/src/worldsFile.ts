// The worlds' file as space and its rail read it (7n2), and as every view that needs all the worlds does (the passport's constellations, the
// search palette, a plate's connected worlds and realm card): one query, one request for the page's life, read again only after five minutes
// (the file is a job's, written now and then, and the browser's own cache holds it too). What it brings is counted as space draws it, and that
// count stands over the one the home read. The reader and its schema come in a chunk of their own: a plate's first screen holds neither.
import { worldsDrawn as counted } from "@gnoworld/core";
import { queryOptions, useQuery } from "@tanstack/react-query";
import type { Worlds } from "@gnoworld/schemas/indexer";
import { queryClient, quietUnread, Unread } from "./lib/query/client.ts";
import { keys } from "./lib/query/keys.ts";
import { pageFetch } from "./lib/query/policy.ts";
import { worldsDrawn } from "./features/universe/worldsCount.ts";

const FILE_FRESH_MS = 5 * 60_000;

const worldsOptions = () =>
  queryOptions({
    queryKey: keys.worlds(import.meta.env.BASE_URL),
    staleTime: FILE_FRESH_MS,
    queryFn: async ({ signal }) => {
      const { readWorlds } = await import("./lib/chain/realms.ts");
      const file = await readWorlds(import.meta.env.BASE_URL, { fetch: pageFetch, signal });
      if (file === undefined) throw new Unread(undefined);
      worldsDrawn(counted(file.worlds));
      return file;
    },
  });

/** The worlds' file, read once; none when it did not come whole (the next reader asks again). */
export async function worldsFile(): Promise<Worlds | undefined> {
  return queryClient.query(worldsOptions()).catch((error: unknown) => {
    quietUnread(error);
    return undefined;
  });
}

/** The file's worlds once `open`, for a view that needs every world (the passport, the search palette, a plate): undefined while they come, an
 * empty list when the file did not come, so the view falls back to what the device holds. */
export function useWorldsFile(open: boolean): Worlds["worlds"] | undefined {
  const { data, isError } = useQuery({ ...worldsOptions(), enabled: open }, queryClient);
  return data?.worlds ?? (isError ? [] : undefined);
}
