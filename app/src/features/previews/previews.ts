// The previews' shared parts (8f): the captures' file, kept a page however many places ask, the universe whose pages it holds, and a
// path written as the video writes it.
import type { Previews } from "@gnoworld/schemas/indexer";
import { queryOptions } from "@tanstack/react-query";
import { Unread, queryClient, quietUnread } from "../../lib/query/client.ts";
import { keys } from "../../lib/query/keys.ts";
import { pageFetch } from "../../lib/query/policy.ts";
import { readPreviews } from "../../lib/chain/previews.ts";
import { site, type UniverseView } from "../../places.ts";

/** A realm's path as frames 26 and 104 write it: whole up to 20 characters, else its middle folders cut, its last kept. */
export function shortPath(path: string): string {
  const [, , ...folders] = path.split("/");
  const last = folders.at(-1);
  return path.length <= 20 || folders.length < 2 || last === undefined ? path : `gno.land/r/…/${last}`;
}

/** The default universe: its gnoweb is where a line's link must point, its id the one the file must be of. */
export const captured = (): UniverseView => site.universeAt("/");

const previewsOptions = () =>
  queryOptions({
    queryKey: keys.previews(import.meta.env.BASE_URL),
    queryFn: async ({ signal }) => {
      const file = await readPreviews(import.meta.env.BASE_URL, { fetch: pageFetch, signal });
      if (file === undefined) throw new Unread(undefined);
      return file;
    },
  });

/** The captures' file, kept a page however many places ask; none when it did not come whole (the next ask reads again). */
export const sharedPreviews = (): Promise<Previews | undefined> =>
  queryClient.query(previewsOptions()).catch((error: unknown) => {
    quietUnread(error);
    return undefined;
  });
