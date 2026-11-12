// The plate's one model (slice 13, D566, D567): what every kind of place gives the blocks, in the blocks' order. An adapter per kind (a realm,
// the Earth, a hub world) fills it from its own sources; a block with no data is left out of it, never invented, and the blocks draw only
// what the model holds. A satellite plugs in later with an adapter of its own, no new block.
import type { ReactNode } from "react";
import type { RealmRollup, Worlds } from "@gnoworld/schemas/indexer";
import type { FromExplorerProps } from "../../features/realms/FromExplorer.tsx";
import type { ActionsProps } from "../../features/world/Actions.tsx";
import type { Around } from "./around.ts";
import type { Capability } from "./capabilities.ts";
import type { Hours } from "../../features/world/useHours.ts";
import type { Figure } from "@gnoworld/ui";
import type { Explained } from "../../features/explain/useExplanation.ts";
import type { Realm } from "../../features/realms/useRealm.ts";

/** A small square of the plate's foot: one fact, one large value. */
export interface Widget {
  label: string;
  value: string;
  /** Small beside the value ("block", "GNOT"). */
  unit?: string;
  /** An address whose face stands before the value (the author). */
  face?: string;
  /** Under the value, in the label's style. */
  detail?: string;
  /** Lines that open under the value: its imports, its functions. A square without any has no Expand. */
  more?: readonly string[];
}

/** What a realm's own blocks draw: its page as read, then its calls to try. */
interface RealmPart {
  realm: string;
  chain: { name: string; chainId: string; rpc: string; gnoweb: string; indexer: string };
  state: Realm;
  worlds: Worlds["worlds"] | undefined;
  /** Its calls by day, its callers, its last calls and its functions, once the server's file has come; none, those blocks are absent. */
  rollup: RealmRollup | undefined;
}

export interface PlateModel {
  /** Under the title: a sentence of the place's own words; at the kicker's row, whether it lives and its rank. */
  lede: {
    sentence?: ReactNode;
    /** The sentence is still being read: its line's room is kept, so it never pushes what is under it when it comes. */
    pending?: boolean;
    /** Jarvis's two-sentence line from the code stands in the sentence's place once made; the sentence is the fallback. */
    explain?: Explained | undefined;
    status?: { label: string; tone: "mine" | "warm" | "neutral" } | undefined;
    /** The rank's words, and what it ranks among (the pill's hint, the proposal's title). */
    rank?: { label: string; among: string } | undefined;
  };
  actions: ActionsProps;
  /** The talk bar: what to call the place, and its room's id in the chat. */
  talk?: { name: string; room: string } | undefined;
  /** The figures band: the hero figure first, then the small ones; a note says what they cannot. */
  figures: Figures;
  /** The chat's messages an hour (the chart of a place with no calls to count). */
  hours?: Hours | undefined;
  /** What only this kind has, between the chart and the page: a hub's proposals, the Earth's latest on X. */
  extras?: ReactNode;
  realm?: RealmPart | undefined;
  /** What stands around it, once the worlds' file has come. */
  around?: Around | undefined;
  /** What it can do, from its imports. */
  can?: readonly Capability[] | undefined;
  /** Its links out, under the squares. */
  links?: readonly { label: string; href: string | undefined }[] | undefined;
  widgets: readonly Widget[];
  explorer?: FromExplorerProps | undefined;
}

interface Figures {
  figures: readonly Figure[];
  note?: string | undefined;
}
