// The Following shelf: the worlds the reader follows, as the palette's own rows (the world's planet, its name, what its realms add up to),
// in Discover's sort; a click goes to the world's page.
import type { SortId } from "@gnoworld/core";
import { EmptyState, Stack } from "@gnoworld/ui";
import { PlaceResults } from "../PlaceResults.tsx";
import { sortPlaces } from "../ranks.ts";
import type { SearchItem } from "../types.ts";
import styles from "./Discover.module.css";

const plural = (n: number, word: string) => `${String(n)} ${word}${n === 1 ? "" : "s"}`;

const noteOf = ({ realmCount, rank }: SearchItem) =>
  realmCount === undefined || rank === undefined
    ? "No realm in the file yet"
    : `${plural(realmCount, "realm")} · ${plural(rank.calls, "call")}`;

export function Followed({
  worlds,
  ranked,
  sort,
  go,
}: {
  worlds: readonly SearchItem[];
  /** Whether the worlds' file has come: before it, a world has no count to state. */
  ranked: boolean;
  sort: SortId;
  go: (item: SearchItem) => void;
}) {
  const results = sortPlaces(worlds, sort).map((item) => ({
    item,
    hits: [],
    ...(ranked ? { note: noteOf(item) } : {}),
  }));
  return (
    <Stack space="xs">
      <div className={styles["rowHead"]}>
        <h3>Following</h3>
        <span className={styles["why"]} role="status">
          {plural(worlds.length, "world")}
        </span>
      </div>
      {worlds.length === 0 ? (
        <EmptyState look="inline" line="No world followed yet. A world's page has a Follow button." />
      ) : (
        <PlaceResults groups={[{ id: "following", label: "", results }]} active={-1} more={0} onChoose={go} />
      )}
    </Stack>
  );
}
