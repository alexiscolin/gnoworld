// A station from its seed (part 7x; Alexis, 2026-11-04, "Avant la démo"): a project's name joins a spine, wheels, arms, wings of cells,
// dishes and lights, and past a size an artificial world's great wheel or shell, each count, length and turn from its own draws, so no two
// names build alike and none is picked from a set of models. Its size, 0 a small satellite to 1 an artificial world, comes from the caller:
// a sign, read from the team's file, never from the name. Its parts stand within a reach of 1.
import type { Point } from "../space/cell.ts";
import { armsOf, dishOf, lamp, wingsOf, wheelOf } from "./around.ts";
import { Draws } from "./draws.ts";
import { clamp01 } from "../space/smooth.ts";
import { greatWheelOf, shellOf } from "./great.ts";
import { at, reachOf, scaled, type Part } from "./parts.ts";
import { sidesOf, spineOf, type Spine } from "./spine.ts";

/** The one switch for the stations round the Earth (Alexis, 2026-11-08: "enlève les mcp, adena, gnosh etc. : plus aucun satellite et station pour
 * le moment"). Off: the scene draws none, the hubs of kind "station" are not offered as places, and a direct URL still opens their page. */
export const STATIONS_SHOWN = false as boolean;

export interface Station {
  readonly seed: string;
  readonly size: number;
  /** Its parts, within a reach of 1 round its centre. */
  readonly parts: readonly Part[];
  /** How fast its wheels turn round its spine, in radians a second, either way. */
  readonly spin: number;
  /** Where its spine points in space, a unit vector, and its turn round it at rest. */
  readonly spine: Point;
  readonly turn: number;
}

// Past this size a station is an artificial world: its great parts come.
const GREAT = 0.7;

// The wheels, arms, wings and dishes round `spine`, as many as the draws and the size give; a small one has wings or arms at the least.
function round(draws: Draws, spine: Spine, size: number): Part[] {
  const parts: Part[] = sidesOf(draws, spine, size);
  const wheels = size < 0.25 ? Number(draws.chance(0.3)) : draws.count(0, 1 + Math.floor(1.5 * size));
  for (let index = 0; index < wheels; index += 1) parts.push(...wheelOf(draws, spine, size));
  const armed = draws.chance(0.5 + 0.25 * size);
  if (armed) parts.push(...armsOf(draws, spine, size));
  const wings = draws.count(wheels + Number(armed) === 0 ? 1 : 0, 1 + Math.floor(2 * size));
  for (let index = 0; index < wings; index += 1) parts.push(...wingsOf(draws, spine));
  const dishes = draws.count(0, 1 + Math.round(size));
  for (let index = 0; index < dishes; index += 1) parts.push(...dishOf(draws, spine));
  if (draws.chance(0.7)) parts.push(lamp(at(0, spine.top, 0), 0.03));
  if (draws.chance(0.5)) parts.push(lamp(at(0, spine.bottom, 0), 0.03));
  return parts;
}

// An artificial world's great wheel, its shell, or both, far past what its hub holds: one at the least.
function great(draws: Draws, inner: number, size: number): Part[] {
  const share = (size - GREAT) / (1 - GREAT);
  const wheel = draws.chance(0.45 + 0.3 * share);
  const shell = !wheel || draws.chance(0.25 + 0.3 * share);
  const reach = inner * draws.between(2, 3.6);
  return [
    ...(wheel ? greatWheelOf(draws, reach) : []),
    ...(shell ? shellOf(draws, wheel ? reach * draws.between(0.55, 0.85) : reach) : []),
  ];
}

/** The station `seed` builds at `size`, 0 a small satellite to 1 an artificial world. */
export function stationOf(seed: string, size: number): Station {
  const draws = new Draws(`station ${seed}`);
  const grown = clamp01(size);
  const spine = spineOf(draws, grown);
  const parts = [...spine.parts, ...round(draws, spine, grown)];
  if (grown >= GREAT) parts.push(...great(draws, Math.max(...parts.map(reachOf)), grown));
  const reach = Math.max(...parts.map(reachOf));
  const lean = draws.between(0, 0.9);
  const way = draws.unit() * 2 * Math.PI;
  return {
    seed,
    size: grown,
    parts: scaled(parts, 1 / reach),
    spin: draws.between(0.04, 0.16) * (draws.chance(0.5) ? 1 : -1),
    spine: { x: Math.sin(lean) * Math.cos(way), y: Math.cos(lean), z: Math.sin(lean) * Math.sin(way) },
    turn: draws.unit() * 2 * Math.PI,
  };
}
