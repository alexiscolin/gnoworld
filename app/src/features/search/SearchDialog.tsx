// The search as a large sheet over a scrim (D355; ⌘K, the "/" key and the header's button). The field is on top. Empty, the sheet is
// Discover, a store of realms (D373); typing, one ranked list of the best 50 at the left with how many more answered, the chosen place's
// preview at the right.
import type { StoreRow } from "@gnoworld/core";
import { Dialog } from "@gnoworld/ui";
import { useEffect, type KeyboardEvent } from "react";
import { placeOf, type UniverseView } from "../../places.ts";
import { itemOf, realmChat } from "./discover/realms.ts";
import { useDiscover } from "./discover/useDiscover.ts";
import { asksHandOff, handOff } from "./handOff.ts";
import { onPaletteKey } from "./keys.ts";
import { PaletteField } from "./PaletteField.tsx";
import { DiscoverSheet, TypedSheet } from "./PaletteBody.tsx";
import { LIST_ID } from "./PlaceResults.tsx";
import styles from "./SearchDialog.module.css";
import { useGo } from "./useGo.ts";
import { usePalette } from "./usePalette.ts";

const NO_WORLDS: never[] = [];

// From the empty field, Down goes to the first card.
function intoCards(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "ArrowDown" || !(event.target instanceof HTMLInputElement)) return;
  const card = event.currentTarget.querySelector<HTMLElement>("[data-card]");
  if (card === null) return;
  event.preventDefault();
  card.focus();
}

export default function SearchDialog({
  universe,
  open,
  onClose,
  start = "",
}: {
  universe: UniverseView;
  open: boolean;
  onClose: () => void;
  /** The namespace a full Plan's "+N" opens on (F5462). */
  start?: string;
}) {
  const palette = usePalette(universe, open, start);
  // A chip or a namespace on, with no words, lists the places it keeps, not Discover.
  const discovering = palette.query.trim() === "" && palette.filters.size === 0 && palette.namespace === undefined;
  const { flat, active, choose } = palette;
  const chosen = discovering ? undefined : palette.chosen;
  const discovery = useDiscover(discovering ? (palette.worlds ?? NO_WORLDS) : NO_WORLDS, {
    here: palette.here,
    universe: universe.id,
    following: palette.followedPlaces.length,
  });
  useEffect(() => {
    document.getElementById(`${LIST_ID}-${String(active)}`)?.scrollIntoView({ block: "nearest" });
  }, [active]);
  const close = () => {
    palette.reset();
    onClose();
  };
  const { go, chat, copy, copied } = useGo(universe, close);
  const fly = (row: StoreRow) => {
    go(itemOf(row, universe.id));
  };
  // A realm's chat is its own room, full (Alexis, 2026-11-12); a realm with no page of its own talks in its world's, else the Earth's.
  const talk = (row: StoreRow) => {
    const item = itemOf(row, universe.id);
    go(item, realmChat(item, placeOf(universe, row.world)?.href ?? universe.earth.path));
  };
  return (
    <Dialog title="Search" open={open} onClose={close} wide="sheet">
      <div
        className={styles["palette"]}
        onKeyDown={(event) => {
          const handing = handOff(palette.query);
          if (handing !== undefined && asksHandOff(event)) {
            event.preventDefault();
            go(handing);
            return;
          }
          if (discovering) intoCards(event);
          onPaletteKey(event, { chosen, count: flat.length, active, choose, go, chat, copy, close });
        }}
      >
        <PaletteField palette={palette} />
        {discovering ? (
          <DiscoverSheet palette={palette} discovery={discovery} universe={universe} fly={fly} chat={talk} go={go} />
        ) : (
          <TypedSheet palette={palette} copied={copied} go={go} chat={chat} copy={copy} />
        )}
      </div>
    </Dialog>
  );
}
