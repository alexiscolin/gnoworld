// What turns round the Earth (part 7v; Alexis, 2026-11-03): the Earth is no namespace, so no system's worlds are set round it; round it turn
// the projects the team adds by hand, even with no realm (gnosh.ai), each a small body of its own past the golden ring whose Moon the globe
// draws, where its name puts it, held still; the view at rest moves one off a row (deep.ts). Its Plan is plan.ts's.
import { EARTH_PLACE, EARTH_RADIUS, type StarSystem } from "../cosmos/system.ts";
import { nextState, textHash, unitOf } from "../space/cell.ts";

/** A project round the Earth, as the team's file names it: its name, its own address, and a world's page where it has one. */
export interface Project {
  readonly name: string;
  readonly url: string;
  readonly slug?: string | undefined;
}

// In Earth radii: past the small Earth's ring and its Moon, which the view at rest draws 1.9 across and 0.27 wide (scene/earth/orbit.ts),
// with a project's width and a third of the Moon's (7v's design review, F4471), well inside the view at rest's neighbours; a quarter to a
// third of the Earth across, the least a body may be (GRAIN), in the disc's plane.
const NEAREST = 2.7;
const FARTHEST = 4.1;
const SMALLEST = 0.25;
const LARGEST = 0.32;
// The most projects a view of the Earth stands, the file's first: a Plan's twelve (plan.ts).
const MOST = 12;
// A project's id: a tilde stands in no realm's path, so no namespace `earth` of a chain shares it; its name escaped to ASCII, which a
// world's look reads (7v's review, F4453).
const idOf = (name: string) => `~earth/${encodeURIComponent(name)}`;

/** The Earth as what turns round it: its place, the disc's plane, lit by the great star, and each of the file's first twelve projects a
 * small body at the place its name gives. */
export const earthSystemOf = (projects: readonly Pick<Project, "name">[]): StarSystem => ({
  id: "earth",
  place: EARTH_PLACE,
  litBy: { x: 0, y: 0, z: 0 },
  star: 1,
  warmth: 0.5,
  spin: 0,
  tilt: 0,
  node: 0,
  belt: false,
  worlds: projects.slice(0, MOST).map(({ name }) => {
    const first = textHash(`earth ${name}`);
    const [size, out, round] = [unitOf(first), unitOf(nextState(first)), unitOf(nextState(nextState(first)))];
    return {
      id: idOf(name),
      radius: (SMALLEST + (LARGEST - SMALLEST) * size) * EARTH_RADIUS,
      orbit: (NEAREST + (FARTHEST - NEAREST) * out) * EARTH_RADIUS,
      phase: 2 * Math.PI * round,
    };
  }),
});

/** Where each project's name goes, by its id: its world's page where the file names one, else its own address. */
export const earthLinksOf = (projects: readonly Project[]): Map<string, string> =>
  new Map(projects.slice(0, MOST).map(({ name, url, slug }) => [idOf(name), slug === undefined ? url : `/w/${slug}`]));
