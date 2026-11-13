// The passport's stamps as the dialog draws them: one per world the device holds, keyed by the world's id, so two worlds of one name in two
// namespaces are two stamps, each naming its system; the newest first, grouped by the day they were stamped.
import { EARTH, isAddress, stampedIn, stampKey } from "@gnoworld/core";
import { shortAddress } from "@gnoworld/schemas";
import type { IconName } from "@gnoworld/ui";

/** A world as the stamp draws it. */
export interface StampView {
  readonly id: string;
  readonly name: string;
  /** The star system: the world's namespace, an address cut short. */
  readonly system: string;
  /** The UTC day, "2026-11-04", or none when the device kept none. */
  readonly day: string;
  readonly icon: IconName;
  /** Charted first by this device. */
  readonly gold: boolean;
}

/** The days' stamps shown before "Show N more". */
export const SHOWN = 7;

// The icon of what the worlds' file says a world is; any other world is a planet.
const ICONS: Readonly<Record<string, IconName>> = {
  game: "play",
  token: "chart",
  exchange: "share",
  dao: "people",
  nft: "image",
};

/** The system a world's id names: its namespace, the id itself for a realm alone in its namespace, or `fallback` for a world that has none
 * (the Earth, a hub with no realm). */
function systemOf(id: string, fallback: string, namespace: string | undefined): string {
  const system = namespace ?? (id.includes("/") ? id.split("/")[0] : id);
  if (system === undefined || system === "") return fallback;
  return isAddress(system) ? shortAddress(system) : system;
}

/** The universe's stamps, the newest day first, a day's worlds by id; `worlds` is the worlds' file, where it has come. */
export function stampsOf({
  universe,
  universeName,
  stamps,
  charted,
  nameOf,
  worlds,
  hubs = new Set(),
}: {
  universe: string;
  universeName: string;
  stamps: Readonly<Record<string, string>>;
  charted: Readonly<Record<string, string>>;
  nameOf: (id: string) => string;
  worlds: readonly { id: string; namespace: string; nature?: string | null | undefined }[];
  /** The ids of the universe's hubs, which are no namespace. */
  hubs?: ReadonlySet<string>;
}): StampView[] {
  const known = new Map(worlds.map((world) => [world.id, world]));
  const first = stampedIn(charted, universe);
  return [...stampedIn(stamps, universe)]
    .map((id) => {
      const world = known.get(id);
      return {
        id,
        name: nameOf(id),
        system:
          world === undefined && (id === EARTH || hubs.has(id))
            ? universeName
            : systemOf(id, universeName, world?.namespace),
        day: stamps[stampKey(universe, id)] ?? "",
        icon: ICONS[world?.nature ?? ""] ?? "planet",
        gold: first.has(id),
      };
    })
    .sort((a, b) => b.day.localeCompare(a.day) || a.id.localeCompare(b.id));
}

/** The stamps (already newest first) in their days, in the same order. */
export function byDay(stamps: readonly StampView[]): { day: string; stamps: StampView[] }[] {
  const days = new Map<string, StampView[]>();
  for (const stamp of stamps) {
    const held = days.get(stamp.day) ?? [];
    held.push(stamp);
    days.set(stamp.day, held);
  }
  return [...days].map(([day, held]) => ({ day, stamps: held }));
}
