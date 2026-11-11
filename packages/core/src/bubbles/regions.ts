// The regions of a world that has no countries, drawn from its id as the Earth's countries are given (D13996): centres on the sphere, a
// point belonging to the nearest one (a spherical Voronoi), each named from letters and syllables, never from a list of finished names.
import { Draws } from "../station/draws.ts";

export interface Region {
  readonly name: string;
  readonly lat: number;
  readonly lon: number;
}

const FEWEST = 4;
const MOST = 9;
const MOST_LAT = 35;
const ONSETS = "bdfgklmnprstvzhjw";
const VOWELS = "aeiou";
const CODAS = "nrlsm";
// The ground is drawn on the GPU: a name never claims a terrain it could contradict.
const TERRAIN = /sea|mount|lake|ocean|hill|isle|rock|river|ice|bay/;

const pick = (letters: string, draws: Draws): string => letters.charAt(draws.count(0, letters.length - 1));

function nameOf(draws: Draws): string {
  const syllables = draws.count(2, 4);
  let name = "";
  for (let at = 0; at < syllables; at += 1) {
    name += pick(ONSETS, draws) + pick(VOWELS, draws) + (draws.chance(0.3) ? pick(CODAS, draws) : "");
  }
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** The regions of `world`: 4 to 9, each with a name of 4 to 14 letters, none the same twice, and a centre. */
export function regionsOf(world: string): Region[] {
  const draws = new Draws(`${world}:regions`);
  const count = draws.count(FEWEST, MOST);
  const taken = new Set<string>();
  return Array.from({ length: count }, () => {
    let name = nameOf(draws);
    while (taken.has(name) || TERRAIN.test(name.toLowerCase())) name = nameOf(draws);
    taken.add(name);
    return { name, lat: draws.between(-MOST_LAT, MOST_LAT), lon: draws.between(-180, 180) };
  });
}

const RAD = Math.PI / 180;
const unit = ({ lat, lon }: { lat: number; lon: number }) =>
  [Math.cos(lat * RAD) * Math.cos(lon * RAD), Math.cos(lat * RAD) * Math.sin(lon * RAD), Math.sin(lat * RAD)] as const;

/** The region a point of `world` falls in: the one whose centre is nearest on the sphere, the first on a tie. */
export function regionAt(world: string, at: { lat: number; lon: number }): Region {
  const [x, y, z] = unit(at);
  const regions = regionsOf(world);
  const nearness = (region: Region) => {
    const [a, b, c] = unit(region);
    return a * x + b * y + c * z;
  };
  return regions.reduce(
    (best, region) => (nearness(region) > nearness(best) ? region : best),
    regions[0] ?? { name: "", lat: 0, lon: 0 },
  );
}
