// The Earth's maps, one owner for them: its day and night, the clouds every world shares, and the Moon. Any that fails fails them all, and
// what did come is freed, whichever came first.
import type { Texture } from "three";
import { freeMap, loadMap, mapUrl } from "../planet/maps.ts";

export interface EarthMaps {
  readonly day: Texture;
  readonly night: Texture;
  readonly clouds: Texture;
  readonly moon: Texture;
}

/** The plan's size (section 4). The Low tier halves each side. */
const MAP_WIDTH = 4096;
/** A moon of a few dozen pixels needs no more. */
const MOON_WIDTH = 1024;

const earthWidth = (halved: boolean): number => (halved ? MAP_WIDTH / 2 : MAP_WIDTH);

interface EarthLoad {
  readonly anisotropy: number;
  readonly halved: boolean;
  readonly signal: AbortSignal;
}

/** Loads them all, or none. */
export async function loadEarthMaps(base: string, { anisotropy, halved, signal }: EarthLoad): Promise<EarthMaps> {
  const width = earthWidth(halved);
  const answers = await Promise.allSettled([
    loadMap(mapUrl("earth-day", base, width), { kind: "colour", anisotropy, width, signal }),
    loadMap(mapUrl("earth-night", base, width), { kind: "colour", anisotropy, width, signal }),
    loadMap(mapUrl("clouds", base, width), { kind: "data", anisotropy, width, signal }),
    loadMap(mapUrl("moon", base, MOON_WIDTH), { kind: "colour", anisotropy, width: MOON_WIDTH, signal }),
  ]);
  const [day, night, clouds, moon] = answers;
  if (
    day.status === "fulfilled" &&
    night.status === "fulfilled" &&
    clouds.status === "fulfilled" &&
    moon.status === "fulfilled"
  )
    return { day: day.value, night: night.value, clouds: clouds.value, moon: moon.value };
  for (const answer of answers) if (answer.status === "fulfilled") freeMap(answer.value);
  throw new Error("the Earth's maps did not come");
}
