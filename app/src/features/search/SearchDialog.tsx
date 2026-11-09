// The search as a large sheet over a scrim (D355; ⌘K, the "/" key and the header's button). The field is on top. Empty, the sheet is
// Discover, a store of realms (D373); typing, one ranked list of the best 50 at the left with how many more answered, the chosen place's
// preview at the right.
import type { StoreRow } from "@gnoworld/core";
import { Dialog } from "@gnoworld/ui";
import { useEffect, type KeyboardEvent } from "react";
import { placeOf, type UniverseView } from "../../places.ts";
import { itemOf } from "./discover/realms.ts";
import { useDiscover } from "./discover/useDiscover.ts";
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
  const discovering = palette.query.trim() === "";
  const { flat, active, choose } = palette;
  const chosen = discovering ? undefined : palette.chosen;
  const discovery = useDiscover(discovering ? (palette.worlds ?? NO_WORLDS) : NO_WORLDS, palette.here, universe.id);
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
  // A realm's chat is its world's, where the universe has a page for it, and the Earth's where it has none.
  const talk = (row: StoreRow) => {
    chat(itemOf(row, universe.id), placeOf(universe, row.world)?.href ?? universe.earth.path);
  };
  return (
    <Dialog title="Search" open={open} onClose={close} wide="sheet">
      <div
        className={styles["palette"]}
        onKeyDown={(event) => {
          if (discovering) intoCards(event);
          onPaletteKey(event, { chosen, count: flat.length, active, choose, go, chat, copy, close });
        }}
      >
        <PaletteField palette={palette} />
        {discovering ? (
          <DiscoverSheet palette={palette} discovery={discovery} universe={universe} fly={fly} chat={talk} />
        ) : (
          <TypedSheet palette={palette} copied={copied} go={go} chat={chat} copy={copy} />
        )}
      </div>
    </Dialog>
  );
}
