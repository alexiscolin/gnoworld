// Discover (D373): the palette's empty field. The shelves at the left, the cards in the middle (Today's rows, or a shelf's grid), and the
// chosen realm's detail at the right. Loaded when the palette opens, in a chunk of its own.
import type { StoreRow } from "@gnoworld/core";
import { EmptyState, Stack } from "@gnoworld/ui";
import { Controls } from "./Controls.tsx";
import { Detail } from "./Detail.tsx";
import { Grid, moveAmongCards, TodayRows } from "./Cards.tsx";
import styles from "./Discover.module.css";
import { Followed } from "./Followed.tsx";
import { Shelves } from "./Shelves.tsx";
import type { SearchItem } from "../types.ts";
import type { Discovery } from "./useDiscover.ts";

export interface DiscoverProps {
  discovery: Discovery;
  universe: string;
  fly: (row: StoreRow) => void;
  chat: (row: StoreRow) => void;
  /** The worlds the reader follows, and the way to one's page. */
  followed: readonly SearchItem[];
  /** Whether the worlds' file has come. */
  ranked: boolean;
  go: (item: SearchItem) => void;
}

export default function Discover({ discovery, universe, fly, chat, followed, ranked, go }: DiscoverProps) {
  const { picked, shelf, today, list } = discovery;
  return (
    <div className={[styles["discover"], "enter"].join(" ")} data-detail={picked === undefined ? undefined : ""}>
      <Shelves discovery={discovery} />
      <div className={styles["content"]} onKeyDown={moveAmongCards}>
        <Stack space="m">
          <Controls discovery={discovery} />
          {shelf === "following" ? (
            <Followed worlds={followed} ranked={ranked} sort={discovery.sort} go={go} />
          ) : shelf === "today" ? (
            <TodayRows rows={today} discovery={discovery} />
          ) : (
            <Grid rows={list} discovery={discovery} />
          )}
          {shelf === "today" && today.length === 0 ? (
            <EmptyState look="inline" line="No realm here with these filters. Clear one of them." />
          ) : null}
        </Stack>
      </div>
      {picked === undefined ? null : (
        <Detail row={picked} discovery={discovery} universe={universe} fly={fly} chat={chat} />
      )}
    </div>
  );
}
