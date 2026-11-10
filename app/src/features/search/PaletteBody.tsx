// What the sheet holds under the field: Discover while the field is empty (its cards a chunk of their own, asked when the palette opens),
// and once words are typed, the ranked results with the chosen place's preview.
import type { StoreRow } from "@gnoworld/core";
import { lazy, Suspense, type ReactNode } from "react";
import type { UniverseView } from "../../places.ts";
import type { Discovery } from "./discover/useDiscover.ts";
import { parseQuery } from "./match.ts";
import { PaletteLeft } from "./PaletteLeft.tsx";
import { PlacePreview } from "./PlacePreview.tsx";
import { PlaceResults } from "./PlaceResults.tsx";
import appear from "../../enter.module.css";
import styles from "./SearchDialog.module.css";
import type { SearchItem } from "./types.ts";
import type { usePalette } from "./usePalette.ts";

const Discover = lazy(() => import("./discover/Discover.tsx"));

type Palette = ReturnType<typeof usePalette>;

function Empty({ query }: { query: string }) {
  return (
    <p className="empty-note">
      {parseQuery(query).mode === "address"
        ? "No page holds an address yet."
        : `No place answers “${query.trim()}”. Try > explore for a live place.`}
    </p>
  );
}

export function DiscoverSheet({
  palette,
  discovery,
  universe,
  fly,
  chat,
}: {
  palette: Palette;
  discovery: Discovery;
  universe: UniverseView;
  fly: (row: StoreRow) => void;
  chat: (row: StoreRow) => void;
}): ReactNode {
  if (palette.worlds === undefined)
    return (
      <p className="empty-note">
        {universe.isDefault ? "Reading the realms…" : "Discover has no realms for this universe yet."}
      </p>
    );
  return (
    <Suspense fallback={null}>
      <Discover discovery={discovery} universe={universe.id} fly={fly} chat={chat} />
    </Suspense>
  );
}

export function TypedSheet({
  palette,
  copied,
  go,
  chat,
  copy,
}: {
  palette: Palette;
  copied: boolean;
  go: (item: SearchItem) => void;
  chat: (item: SearchItem) => void;
  copy: (item: SearchItem) => void;
}) {
  const { chosen, flat, active, choose } = palette;
  return (
    <div className={[styles["body"], appear["enter"]].join(" ")}>
      <PaletteLeft palette={palette}>
        {flat.length === 0 ? (
          <Empty query={palette.query} />
        ) : (
          <PlaceResults groups={palette.groups} active={active} more={palette.more} onChoose={go} onHover={choose} />
        )}
      </PaletteLeft>
      {chosen === undefined ? (
        <div className={["rule-start", styles["preview"]].join(" ")} />
      ) : (
        <PlacePreview
          key={`${chosen.kind}:${chosen.path}`}
          item={chosen}
          copied={copied}
          go={go}
          chat={chat}
          copy={copy}
        />
      )}
    </div>
  );
}
