// A postcard read in depth (part 7p; Alexis, 2026-11-03, "pas 2 planètes de la même taille au même niveau, c'est pas naturel"): its plane
// turned about the eye's line, as open as it was, till no two neighbours stand at one height, and each world drawn at a share of its size,
// the nearer the larger, 1.5 times the next farther or more through its turn, none under a body's least size. Its data stays its own.
import type { Orbiter, StarSystem } from "../cosmos/system.ts";
import { DRAWN_LEAST } from "../lod/ladder.ts";
import { atOneHeight } from "./composition.ts";
import { dot, focalOf, minus, placeOf, REST_SCREENS, type Camera } from "./restLook.ts";
import type { Point } from "../space/cell.ts";

// The turns tried: every ten degrees, both ways, its own first. A thousandth over 1.5, so the rounding of a projection never reads
// a pair under it.
const TURN = Math.PI / 18;
const TURNS = 36;
const APART = 1.5015;
// A share is judged at the eight instants of its turn a view is judged at; a body stays the view's least drawn size or more.
const INSTANTS = 8;
const { width: WIDTH, height: HEIGHT } = REST_SCREENS[0];

/** The normal of `system`'s plane, as `onPlane` stands it. */
export const normalOf = ({ tilt, node }: Pick<StarSystem, "tilt" | "node">): Point => ({
  x: -Math.sin(node) * Math.sin(tilt),
  y: Math.cos(tilt),
  z: Math.cos(node) * Math.sin(tilt),
});

/** `system` with the plane whose normal is `normal`, its upward side kept up. */
export function withNormal(system: StarSystem, { x, y, z }: Point): StarSystem {
  const sign = y < 0 ? -1 : 1;
  return { ...system, tilt: Math.atan2(Math.hypot(x, z), Math.abs(y)), node: Math.atan2(-sign * x, sign * z) };
}

// Where `place` stands on the video's screen through `camera`, in pixels, and the pixels to a unit there: no outline, for a search asks
// thousands.
function spotOn({ eye, ahead, right, up }: Camera, place: Point): [x: number, y: number, scale: number] {
  const from = minus(place, eye);
  const scale = focalOf(HEIGHT) / Math.max(dot(from, ahead), 1e-9);
  return [WIDTH / 2 + dot(from, right) * scale, HEIGHT / 2 - dot(from, up) * scale, scale];
}

// `plane` turned `angle` about the line from the eye to its star, as open as it was: none where its normal would turn down, for the eye
// would then see its other side.
function turned(plane: StarSystem, eye: Point, angle: number): StarSystem | undefined {
  const axis = minus(plane.place, eye);
  const length = Math.hypot(axis.x, axis.y, axis.z);
  const [normal, cos, sin] = [normalOf(plane), Math.cos(angle), Math.sin(angle)];
  const along = (dot(axis, normal) * (1 - cos)) / length ** 2;
  const at = (to: "x" | "y" | "z", a: "x" | "y" | "z", b: "x" | "y" | "z") =>
    normal[to] * cos + ((axis[a] * normal[b] - axis[b] * normal[a]) / length) * sin + axis[to] * along;
  const y = at("y", "z", "x");
  return y < 0 ? undefined : withNormal(plane, { x: at("x", "y", "z"), y, z: at("z", "x", "y") });
}

// Whether any of `spots` stands at one height with its nearest neighbour.
const anyLevel = (spots: readonly (readonly [number, number, number])[]) =>
  spots.some(([x, y], at) => {
    const apart = (other: number) =>
      other === at ? Infinity : Math.hypot((spots[other]?.[0] ?? x) - x, (spots[other]?.[1] ?? y) - y);
    const nearest = spots.reduce((best, _, other) => (apart(other) < apart(best) ? other : best), at);
    const [nx = x, ny = y] = spots[nearest] ?? [];
    return nearest !== at && atOneHeight({ x, y }, { x: nx, y: ny }, HEIGHT);
  });

/** `plane`, the nearest turn of it about the eye's line that stands no two of `worlds` at one height at rest, seen through `camera`; none if
 * no turn does, as for two worlds on its line of nodes, which a turn keeps level. */
export function levelled(plane: StarSystem, worlds: readonly Orbiter[], camera: Camera): StarSystem | undefined {
  for (let step = 0; step <= TURNS; step += 1) {
    const angle = (step % 2 === 1 ? 1 : -1) * Math.ceil(step / 2) * TURN;
    const tried = step === 0 ? plane : turned(plane, camera.eye, angle);
    if (tried !== undefined && !anyLevel(worlds.map((world) => spotOn(camera, placeOf(tried, world, 0))))) return tried;
  }
  return undefined;
}

/** The share of its size each of `worlds` is drawn at in `plane`, seen through `camera`, in their order: the nearest at rest at its own
 * size, each next farther 1.5 times smaller or more at every instant of its turn; all lifted together where the least would fall under
 * 1.5 times a body's least size on the screen. */
export function depthOf(plane: StarSystem, worlds: readonly Orbiter[], camera: Camera): number[] {
  const turn = plane.spin === 0 ? 0 : (2 * Math.PI) / Math.abs(plane.spin) / INSTANTS;
  const scales = worlds.map((world) =>
    Array.from({ length: INSTANTS }, (_, at) => spotOn(camera, placeOf(plane, world, at * turn))[2]),
  );
  const sizes = scales.map((scale, at) => scale.map((one) => one * (worlds[at]?.radius ?? 0)));
  const order = worlds.map((_, at) => at).sort((a, b) => (scales[b]?.[0] ?? 0) - (scales[a]?.[0] ?? 0));
  const shares = worlds.map(() => 1);
  let least = Infinity;
  order.forEach((far, rank) => {
    const near = order[rank - 1] ?? far;
    const room = Math.min(...(sizes[far] ?? []).map((size, at) => (sizes[near]?.[at] ?? size) / size));
    shares[far] = rank === 0 ? 1 : Math.min(1, ((shares[near] ?? 1) * room) / APART);
    least = Math.min(least, (shares[far] ?? 1) * Math.min(...(sizes[far] ?? [])));
  });
  const lift = Math.max(1, DRAWN_LEAST / least);
  return shares.map((share) => share * lift);
}
