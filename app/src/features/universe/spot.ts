// Where a speaker stands on a world that has no countries (D565): a point of its ground drawn from a seed, the world's id and the speaker's
// account or guest name, so the same person speaks from the same place on a given world, never from a list.
import { textHash, unitOf } from "@gnoworld/core";
import type { LatLon } from "../../space/earth/ground.ts";

// raw: a page frames its planet larger than the window, so only a band round its equator, 30 degrees each way, stands in the free area
const MOST_LAT = 30;

/** The point of `world`'s ground `account` speaks from. */
export function spotOf(world: string, account: string): LatLon {
  const seed = `${world}:${account.toLowerCase()}`;
  return {
    lat: (unitOf(textHash(`${seed}:lat`)) * 2 - 1) * MOST_LAT,
    lon: unitOf(textHash(`${seed}:lon`)) * 360 - 180,
  };
}
