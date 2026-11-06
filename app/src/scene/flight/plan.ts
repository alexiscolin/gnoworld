// Where a flight goes (7g): to a star's arrival, the eye and look core composes for its system (7g2); back to the view at rest, its way
// undone; or a page's straight along the view. And what the panel calls where it goes, never an address. The ways between the map and the
// stage are the cosmos's, which the sight hands over; so are its arrivals, which a flight leaves first, the eye kept where it stands.
import type { Point } from "@gnoworld/core";
import { isPlace, starName } from "./aim.ts";
import type { Bound, CosmosSight, FlightDevice, FlightGoal } from "./goal.ts";
import type { Way } from "./way.ts";

const point = () => ({ x: NaN, y: NaN, z: NaN });

interface From {
  readonly eye: Point;
  readonly look: Point;
  readonly up: Point;
}

// The map's up on the stage: the rig turns about it as the cosmos's camera does.
function upOf(sight: CosmosSight): Point {
  const [top, centre] = [point(), point()];
  sight.toScene({ x: 0, y: 1, z: 0 }, top);
  sight.toScene({ x: 0, y: 0, z: 0 }, centre);
  return { x: top.x - centre.x, y: top.y - centre.y, z: top.z - centre.z };
}

// Where the way starts: the eye as placed and what it looks at, a flight's or the arrival's it rests at; that arrival left, the eye's
// travel carrying it where it stands. None where the cosmos is not placed.
function leaving({ eye, arrive }: FlightDevice, sight: CosmosSight | undefined): From | undefined {
  if (sight === undefined || !isPlace(sight.eye)) return undefined;
  const arrival = sight.arrival;
  const at = arrival?.at === true;
  const look = eye.look ?? (at ? arrival.looked : undefined) ?? sight.earth;
  const from = { eye: { ...sight.eye }, look: { ...look }, up: upOf(sight) };
  if (at) {
    arrival.leave();
    arrive(undefined);
  }
  return from;
}

// Whether the scene's eye rests where it does, no flight's way off it, looking as at rest.
const rests = ({ look, travel: { x, y, z } }: FlightDevice["eye"]): boolean =>
  look === undefined && x === 0 && y === 0 && z === 0;

// Sets `way` back to the view at rest from where the scene's eye is, and gives what the panel calls it; none from the view at rest itself,
// or where the cosmos is not placed.
function restWay(device: FlightDevice, way: Way): string | undefined {
  const sight = device.cosmos();
  const arrival = sight?.arrival;
  arrival?.bind(undefined).catch(reportError);
  const { travel } = device.eye;
  if (arrival?.at !== true && rests(device.eye)) return undefined;
  const from = leaving(device, sight);
  if (from === undefined || sight === undefined) return undefined;
  const home = { x: from.eye.x - travel.x, y: from.eye.y - travel.y, z: from.eye.z - travel.z };
  way.arc(from, { eye: home, look: sight.earth }, { travel, keepLook: false });
  return "Cosmos";
}

// Sets `way` to the arrival `bound` of the star `id` names, and gives what the panel calls it; none, for a star the cosmos does not hold
// or a cosmos not placed.
function starWay(device: FlightDevice, { id, bound }: { id: string; bound: Bound }, way: Way): string | undefined {
  const sight = device.cosmos();
  const system = sight?.systems().find((one) => one.id === id);
  if (system === undefined) return undefined;
  const from = leaving(device, sight);
  if (from === undefined) return undefined;
  way.arc(from, bound, { travel: device.eye.travel, keepLook: true });
  return starName(system);
}

/** Binds the arrival of the star `id`, then sets `way` to it and hands what the panel calls it to `start`, unless `current` says a later
 * flight was asked; says whether it may: none, with no arrival to bind. */
export function bindStar(
  device: FlightDevice,
  id: string,
  { way, current, start }: { way: Way; current: () => boolean; start: (target: string | undefined) => void },
): boolean {
  const arrival = device.cosmos()?.arrival;
  arrival
    ?.bind(id)
    .then((bound) => {
      if (bound !== undefined && current()) start(starWay(device, { id, bound }, way));
    })
    .catch(reportError);
  return arrival !== undefined;
}

/** A star's flight lands on its arrival, the eye handed over where `handed`: else it lands there at once. */
export function landStar(device: FlightDevice, id: string, handed: boolean): void {
  if (handed) device.cosmos()?.arrival?.handOver();
  device.arrive(id);
}

/** Sets `way` for `goal` from where the scene's eye is, back to the view at rest or a page's straight along the view, and gives what the
 * panel calls it; none, where the goal cannot be reached. */
export function planWay(
  goal: Exclude<FlightGoal, { kind: "star" }>,
  device: FlightDevice,
  way: Way,
): string | undefined {
  if (goal.kind === "rest") return restWay(device, way);
  way.straight(device.eye.travel, goal.kind === "body", device.camera);
  device.eye.look = undefined;
  return goal.name;
}
