// How many worlds the cosmos draws (slice 7d6), which the first screen's hero says. The home reads it from the count the server writes beside
// the worlds' file (7n2), a few bytes on phones and computers alike; the scene's read of the file says what it draws, and that count stands.
// Apart from the scene's chunk, so the door and the chunk it opens do not import each other.
import { useEffect, useState, useSyncExternalStore } from "react";
import { readWorldsCount } from "../../lib/chain/worldsCount.ts";
import { queryOptions } from "@tanstack/react-query";
import { queryClient, Unread } from "../../lib/query/client.ts";
import { keys } from "../../lib/query/keys.ts";
import { pageFetch } from "../../lib/query/policy.ts";
import { Heard } from "../../lib/heard.ts";

const worldsCountOptions = () =>
  queryOptions({
    queryKey: keys.worldsCount(import.meta.env.BASE_URL),
    queryFn: async ({ signal }) => {
      const file = await readWorldsCount(import.meta.env.BASE_URL, { fetch: pageFetch, signal });
      if (file === undefined) throw new Unread(undefined);
      return file;
    },
  });

let drawnWorlds: number | undefined;
const counting = new Heard();

/** Says how many worlds the cosmos draws, once a read has brought it: the worlds' count the home reads, or the file the scene draws. */
export function worldsDrawn(count: number): void {
  drawnWorlds = count;
  counting.tell();
}

/** How many worlds the cosmos draws, once a read has said; nothing before, nor in the build. */
const useWorldsDrawn = (): number | undefined =>
  useSyncExternalStore(
    counting.subscribe,
    () => drawnWorlds,
    () => undefined,
  );

// The count's read, whoever asked it: one request while it is in flight and fresh; one that brought nothing is asked again by the next home.
function ask(): Promise<void> {
  return queryClient.query(worldsCountOptions()).then(
    (file) => {
      if (drawnWorlds === undefined) worldsDrawn(file.count);
    },
    (error: unknown) => {
      if (!(error instanceof Unread)) throw error;
    },
  );
}

/** How many worlds the cosmos draws, while `wanted`: the page reads their count once a visit, whether the scene runs or not. Nothing while it
 * comes; null once this page's read has ended with none known, until a read brings it. A read that brought one has told the store first. */
export function useWorldsCount(wanted: boolean): number | null | undefined {
  const count = useWorldsDrawn();
  const [ended, setEnded] = useState(false);
  useEffect(() => {
    if (wanted && count === undefined)
      ask().then(
        () => {
          setEnded(true);
        },
        () => undefined,
      );
  }, [wanted, count]);
  if (!wanted) return undefined;
  return count ?? (ended ? null : undefined);
}
