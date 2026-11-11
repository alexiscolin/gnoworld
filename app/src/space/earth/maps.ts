// The Earth's maps, one owner for them: its day and night (half size for the first frame, then full size), the Moon, and the height of
// both. The clouds every world shares are Maps' own (parts/maps.ts). Each set comes whole or not at all, and what did come is freed.
import type { Texture } from "three";
import { freeMap, loadMap, mapUrl, type MapLoad } from "../planet/maps.ts";

export interface EarthMaps {
  readonly day: Texture;
  readonly night: Texture;
  readonly clouds: Texture;
  readonly moon: Texture;
}

export type FullEarth = Pick<EarthMaps, "day" | "night" | "clouds">;

export interface ReliefMaps {
  readonly earth: Texture;
  readonly moon: Texture;
}

/** The plan's size (section 4); the first frame is built from half of it, the files the page's HTML already asked for. */
const FULL = 4096;
const HALF = FULL / 2;
/** A moon of a few dozen pixels needs no more. */
const MOON = 1024;

interface Want {
  readonly name: string;
  readonly kind: MapLoad["kind"];
  readonly width: number;
}

type How = Pick<MapLoad, "anisotropy" | "signal">;

/** Loads each map of `wanted`, or none: what did come is freed, whichever came first. */
async function allOrNone<K extends string>(
  base: string,
  wanted: Readonly<Record<K, Want>>,
  how: How,
): Promise<Record<K, Texture>> {
  const entries = Object.entries<Want>(wanted);
  const answers = await Promise.allSettled(
    entries.map(([, { name, kind, width }]) => loadMap(mapUrl(name, base, width), { ...how, kind, width })),
  );
  const loaded = answers.flatMap((answer) => (answer.status === "fulfilled" ? [answer.value] : []));
  if (loaded.length < answers.length) {
    for (const texture of loaded) freeMap(texture);
    throw new Error("a set of the Earth's maps did not come");
  }
  return Object.fromEntries(entries.map(([key], at) => [key, loaded[at]])) as Record<K, Texture>;
}

/** The Earth's day and night at half size, and the Moon. */
export const loadEarthMaps = (base: string, how: How): Promise<Omit<EarthMaps, "clouds">> =>
  allOrNone(
    base,
    {
      day: { name: "earth-day", kind: "colour", width: HALF },
      night: { name: "earth-night", kind: "colour", width: HALF },
      moon: { name: "moon", kind: "colour", width: MOON },
    },
    how,
  );

/** The day, night and clouds at full size, to swap in behind the half-size ones. */
export const loadFullEarth = (base: string, how: How): Promise<FullEarth> =>
  allOrNone(
    base,
    {
      day: { name: "earth-day", kind: "colour", width: FULL },
      night: { name: "earth-night", kind: "colour", width: FULL },
      clouds: { name: "clouds", kind: "data", width: FULL },
    },
    how,
  );

/** The Earth's and the Moon's real height, one grey channel each. */
export const loadReliefMaps = (base: string, how: How): Promise<ReliefMaps> =>
  allOrNone(
    base,
    {
      earth: { name: "earth-height", kind: "data", width: FULL },
      moon: { name: "moon-height", kind: "data", width: MOON },
    },
    how,
  );
