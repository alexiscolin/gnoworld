// The whole cosmos's worlds as it draws them (web.ts): each world of the file once, where its system holds it, sized by its use, coloured by
// the mood where its star stands, its calls as the file read them, its light calmed by its star's crowd; and its lines as pairs of them.
import { pointTint, toScene, worldSize, type StarSystem } from "@gnoworld/core";
import { callsOf, lastOf } from "../live.ts";
import { usageOf, type CosmosWorld } from "./cosmosWorld.ts";

// A crowd of one star's worlds stands in a few pixels from afar, and would burn to white: past this many, each adds less.
const SYSTEM_CALM = 8;

/** A world drawn: its system, its orbit, phase and size there, its colour with no activity, the file's word on it, how live it was at the
 * last look, and how much of its light its star's crowd leaves it. */
export interface Held {
  readonly system: StarSystem;
  readonly orbit: number;
  readonly phase: number;
  readonly radius: number;
  readonly tint: readonly [number, number, number];
  readonly called: { readonly calls: number | null; readonly lastHeight: number | null };
  live: number;
  calm: number;
}

/** How much of each one's light a crowd of `count` leaves, `whole` of them showing all of theirs: as the square root of how many more. */
export const calmFor = (count: number, whole: number): number => Math.min(1, Math.sqrt(whole / Math.max(count, 1)));

// A system's worlds' colour, from the mood where its star stands on the stage.
function tintAt(system: StarSystem): readonly [number, number, number] {
  const stage = { x: 0, y: 0, z: 0 };
  const tint = { red: 0, green: 0, blue: 0 };
  toScene(system.place, stage);
  pointTint(stage, tint);
  return [tint.red, tint.green, tint.blue];
}

/** The worlds drawn, each once, and for each of the file's worlds its index among them, or -1 where it has no place. */
export function heldOf(
  systems: readonly StarSystem[],
  worlds: readonly CosmosWorld[],
): { held: Held[]; at: Int32Array } {
  const tints = new Map<string, readonly [number, number, number]>();
  const places = new Map(
    systems.flatMap((system) => system.worlds.map((world) => [world.id, { system, world }] as const)),
  );
  const at = new Int32Array(worlds.length).fill(-1);
  const seen = new Map<string, number>();
  const held: Held[] = [];
  worlds.forEach((world, from) => {
    const place = places.get(world.id);
    at[from] = seen.get(world.id) ?? -1;
    if (place === undefined || at[from] >= 0) return;
    at[from] = held.length;
    seen.set(world.id, held.length);
    const tint = tints.get(place.system.id) ?? tintAt(place.system);
    tints.set(place.system.id, tint);
    const { orbit, phase } = place.world;
    const called = { calls: callsOf(world), lastHeight: lastOf(world) };
    held.push({
      system: place.system,
      orbit,
      phase,
      radius: worldSize(usageOf(world)),
      tint,
      called,
      live: 0,
      calm: 1,
    });
  });
  const crowds = new Map<string, number>();
  for (const { system } of held) crowds.set(system.id, (crowds.get(system.id) ?? 0) + 1);
  for (const each of held) each.calm = calmFor(crowds.get(each.system.id) ?? 1, SYSTEM_CALM);
  return { held, at };
}

/** The lines' ends among the worlds drawn: a pair whose one world has no place goes whole, so no later pair slides onto another world. */
export function endsOf(links: readonly number[], at: Int32Array): number[] {
  const ends: number[] = [];
  for (let pair = 0; pair < links.length; pair += 2) {
    const [from = -1, to = -1] = [at[links[pair] ?? -1], at[links[pair + 1] ?? -1]];
    if (from >= 0 && to >= 0) ends.push(from, to);
  }
  return ends;
}
