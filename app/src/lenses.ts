// Space's lenses (D425): what a tag at the hero's foot lights. Live, the worlds with people in them now; Active, called on chain in the last
// 7 days; each kind, as the search reads a realm's code (D373, styleOf); Following, the reader's. One at a time, kept here and written in the
// address (?lens=) with no navigation, so a pick moves nothing but the light.
import { EARTH, REALM_PREFIX, realmRoom, STYLES, type StyleId } from "@gnoworld/core";
import type { Worlds } from "@gnoworld/schemas/indexer";
import { useSyncExternalStore } from "react";
import { createStore } from "zustand/vanilla";
import { addressState } from "./addressState.ts";
import { storeFor } from "./lib/worldsStore.ts";
import { data, subscribe } from "./railFeed.ts";
import { site } from "./places.ts";
import { worldsFile } from "./features/universe/worldsFile.ts";

export type LensId = "live" | "active" | "following" | Exclude<StyleId, "lab">;

/** The tags at rest, in their order, then the ones behind More. */
export const SHOWN: readonly LensId[] = ["live", "active", "games", "tokens", "dao", "social"];
export const MORE: readonly LensId[] = ["nft", "defi", "markets", "identity", "ai", "following"];

const NAMES: Partial<Record<LensId, string>> = { live: "Live", active: "Active", dao: "DAOs", following: "Following" };
const KNOWN = new Set<string>([...SHOWN, ...MORE]);

/** A lens's name on its tag. */
export const lensName = (lens: LensId): string => NAMES[lens] ?? STYLES.find(({ id }) => id === lens)?.label ?? lens;

const isLens = (word: string | null): word is LensId => word !== null && KNOWN.has(word);

// The worlds each lens of the file lights, by their ids: Active and the kinds, a lab realm aside (the search hides them).
function fileLenses(worlds: Worlds["worlds"]): ReadonlyMap<LensId, ReadonlySet<string>> {
  const lit = new Map<LensId, Set<string>>();
  const add = (lens: LensId, world: string) => {
    const held = lit.get(lens) ?? new Set<string>();
    held.add(world);
    lit.set(lens, held);
  };
  for (const row of storeFor(worlds).rows) {
    if (row.lab) continue;
    if (row.recent) add("active", row.world);
    for (const style of row.styles) if (style !== "lab") add(style, row.world);
  }
  return lit;
}

const picked = addressState<LensId>("lens", (word) => (isLens(word) ? word : undefined));

/** Picks `lens`, or none, kept in the address (addressState.ts). */
export const pickLens = (lens: LensId | undefined): void => {
  picked.set(lens);
};

/** The lens picked now; none on the server. */
export const useLens = (): LensId | undefined => picked.useValue();

/** What lights now: each lens's worlds; none till the worlds' file is read. */
export interface Lit {
  readonly sets: ReadonlyMap<LensId, ReadonlySet<string>>;
}

const NONE: ReadonlySet<string> = new Set();
const lit = createStore<Lit | undefined>(() => undefined);
let held: {
  file?: ReadonlyMap<LensId, ReadonlySet<string>>;
  live: ReadonlySet<string>;
  following: ReadonlySet<string>;
} = {
  live: NONE,
  following: NONE,
};
let started = false;

function tell(): void {
  if (held.file === undefined) return;
  lit.setState({ sets: new Map([...held.file, ["live", held.live], ["following", held.following]]) }, true);
}

/** Who is here names a world by its room's world (a hub's slug, else the id as a slug with ten hex of it, core's realmRoom); the lenses by
 * the worlds' file's id: each room's world to its file's id. */
export const roomWorlds = (
  ids: readonly string[],
  hubs: Parameters<typeof realmRoom>[1],
): ReadonlyMap<string, string> => new Map(ids.map((id) => [realmRoom(`${REALM_PREFIX}${id}`, hubs).world, id]));

/** The worlds with people in them, by their file's id, the Earth aside (it always has its chat). */
export const liveWorlds = (
  present: Iterable<readonly [string, { here: number }]>,
  rooms: ReadonlyMap<string, string>,
): ReadonlySet<string> =>
  new Set([...present].flatMap(([id, { here }]) => (here > 0 && id !== EARTH ? [rooms.get(id) ?? id] : [])));

let rooms: ReadonlyMap<string, string> = new Map();

// Who is here now, as the rail's feed hears it each minute.
function hearLive(): void {
  const present = data()?.signals.present;
  if (present === undefined) return;
  held = { ...held, live: liveWorlds(present, rooms) };
  tell();
}

/** Reads the worlds' file once and hears who is here, for every reader of the light. */
export function startLenses(): void {
  if (started) return;
  started = true;
  worldsFile().then(
    (file) => {
      if (file === undefined) return;
      held = { ...held, file: fileLenses(file.worlds) };
      rooms = roomWorlds(
        file.worlds.map(({ id }) => id),
        site.worlds,
      );
      hearLive();
      tell();
    },
    () => {
      started = false;
    },
  );
  subscribe(hearLive);
  hearLive();
}

/** The worlds the reader follows, which the page knows. */
export function setFollowing(ids: readonly string[]): void {
  held = { ...held, following: new Set(ids) };
  tell();
}

/** What lights now, for a component. */
export const useLit = (): Lit | undefined => useSyncExternalStore(lit.subscribe, lit.getState, () => undefined);

// Each lens's worlds with the Earth among them, made once a set: the same set for the same worlds, so space is lit anew only on a change.
const earthed = new WeakMap<ReadonlySet<string>, ReadonlySet<string>>();

/** `worlds` and the Earth: a filter never dims the home; a tag counts its own worlds alone. */
export function withEarth(worlds: ReadonlySet<string> | undefined): ReadonlySet<string> | undefined {
  if (worlds === undefined) return undefined;
  const made = earthed.get(worlds) ?? new Set([EARTH, ...worlds]);
  earthed.set(worlds, made);
  return made;
}

// The worlds `lens` lights now, the Earth with them; none while the file is unread or no lens is picked.
function litNow(lens: LensId | undefined): ReadonlySet<string> | undefined {
  return lens === undefined ? undefined : withEarth(lit.getState()?.sets.get(lens));
}

/** Lights `space` by the lens picked, now and at each pick or change of what it lights; what it returns lets go. */
export function lightSpace(space: { light(only: ReadonlySet<string> | undefined): void }): () => void {
  // A minute's word of who is here leaves a kind's worlds, or no lens, as they were: space is lit anew only when they change.
  let shown: ReadonlySet<string> | undefined | null = null;
  const lightNow = () => {
    const only = litNow(picked.get());
    if (only === shown) return;
    shown = only;
    space.light(only);
  };
  const unheard = [picked.subscribe(lightNow), lit.subscribe(lightNow)];
  startLenses();
  lightNow();
  return () => {
    for (const stop of unheard) stop();
  };
}
