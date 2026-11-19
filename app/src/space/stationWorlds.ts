// The stations the scene lays out though the worlds' file has none of them: gnosh's colony, a body of gno.land's own system (D13743).
import { EARTH, SHOWN_STATIONS } from "@gnoworld/core";
import type { CosmosWorld } from "./cosmosWorld.ts";
import type { Axis } from "./earth/groundTypes.ts";

/** Each shown station as a world of gno.land's namespace: the home system lays it out past its planets, on an orbit of its own. */
/** Where gnosh's colony stands on its orbit: 1.7 round behind the Earth's 2.2 (layout.ts), across the sun from it in the system's view. */
export const COLONY_PHASE = 2.2 - 1.7;

// The Earth's size, as layout.ts sizes a planet.
const EARTH_SIZE = 2.2;

/** A body's size not sized by its use (layout.ts): the Earth's own, and a colony's, as large as a small planet of its system, 0.9 of the
 * Earth's, read from far; none for a world. */
export const fixedSizeOf = (id: string): number | undefined =>
  id === EARTH ? EARTH_SIZE : SHOWN_STATIONS.includes(id) ? 0.9 * EARTH_SIZE : undefined;

/** A colony's axis, its own and not its seed's: its spine about 55 degrees off the eye of the system's view, of its page and of its
 * picture (measured: the system's eye looks along -z, its page's along 0.86, -0.19, 0.47), so its wheels are seen at three quarters in
 * each, never edge on. */
export const COLONY_AXIS: Axis = { lean: 1.34, tilt: 0.96 };

export const STATION_WORLDS: readonly CosmosWorld[] = SHOWN_STATIONS.map((id) => ({
  id,
  namespace: "gnoland",
  realms: [],
}));
