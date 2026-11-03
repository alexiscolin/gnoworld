// Where a flight goes (7g): a star's stop as core places it, round its star the way the eye came; back to the view at rest, its way undone;
// or a page's straight along the view. And what the panel calls where it goes, never an address. The ways between the map and the stage
// are the cosmos's, which the sight hands over.
import { stopNearIn, type Point } from "@gnoworld/core";
import { isPlace, starName } from "./aim.ts";
import type { CosmosSight, FlightDevice, FlightGoal } from "./goal.ts";
import type { Way } from "./way.ts";

const point = () => ({ x: NaN, y: NaN, z: NaN });

interface From {
  readonly eye: Point;
  readonly look: Point;
  readonly up: Point;
}

// Back to the view at rest: the way the flights took undone, the Earth looked at again; none, from the view at rest itself.
function restWay({ eye }: FlightDevice, from: From, { way, earth }: { way: Way; earth: Point }): string | undefined {
  const { travel } = eye;
  if (eye.look === undefined && travel.x === 0 && travel.y === 0 && travel.z === 0) return undefined;
  const home = { x: from.eye.x - travel.x, y: from.eye.y - travel.y, z: from.eye.z - travel.z };
  way.arc(from, { eye: home, look: earth }, { travel, keepLook: false });
  return "Cosmos";
}

// To the star of the system `id` names, where core stops a flight to it from the eye; none, for a star the cosmos does not hold.
function starWay(
  sight: CosmosSight,
  { id, from }: { id: string; from: From },
  { way, travel }: { way: Way; travel: Point },
) {
  const system = sight.systems().find((one) => one.id === id);
  if (system === undefined) return undefined;
  const [map, stop, star] = [point(), point(), point()];
  const offset = { along: 0, across: 0, up: 0 };
  sight.toMap(from.eye, map);
  stopNearIn(system, map, offset);
  sight.onPlane(system, offset, stop);
  sight.toScene(stop, stop);
  sight.toScene(system.place, star);
  way.arc(from, { eye: stop, look: star }, { travel, keepLook: true });
  return starName(system);
}

// The map's up on the stage: the rig turns about it as the cosmos's camera does.
function upOf(sight: CosmosSight): Point {
  const [top, centre] = [point(), point()];
  sight.toScene({ x: 0, y: 1, z: 0 }, top);
  sight.toScene({ x: 0, y: 0, z: 0 }, centre);
  return { x: top.x - centre.x, y: top.y - centre.y, z: top.z - centre.z };
}

/** Sets `way` for `goal` from where the scene's eye is, and gives what the panel calls it; none, where the goal cannot be reached. */
export function planWay(goal: FlightGoal, device: FlightDevice, way: Way): string | undefined {
  const { eye, camera } = device;
  if (goal.kind === "body" || goal.kind === "cosmos") {
    way.straight(eye.travel, goal.kind === "body", camera);
    eye.look = undefined;
    return goal.name;
  }
  const sight = device.cosmos();
  if (sight === undefined || !isPlace(sight.eye)) return undefined;
  const from = { eye: { ...sight.eye }, look: eye.look ?? sight.earth, up: upOf(sight) };
  if (goal.kind === "rest") return restWay(device, from, { way, earth: sight.earth });
  return starWay(sight, { id: goal.id, from }, { way, travel: eye.travel });
}
