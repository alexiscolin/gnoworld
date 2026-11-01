// Where the Earth stands on the screen, for the journeys, which read no pixel of the canvas to hold its geometry.
import type { Vector3 } from "three";
import type { Globe } from "./globe.ts";
import { ORBIT_RADIUS } from "./orbit.ts";
import type { EarthState } from "./view.ts";

const ORBIT_SAMPLES = 90;
const TURN = Math.PI * 2;

export interface EarthStats {
  readonly state: EarthState;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly turn: number;
  readonly orbit: { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number };
  readonly moon: { readonly x: number; readonly y: number; readonly front: boolean };
  readonly mapWidth: number;
}

interface Screen {
  readonly width: number;
  readonly height: number;
  readonly focal: number;
  readonly eye: Vector3;
}

interface Status {
  readonly state: EarthState;
  readonly turn: number;
}

const NOWHERE = {
  x: 0,
  y: 0,
  radius: 0,
  orbit: { left: 0, right: 0, top: 0, bottom: 0 },
  moon: { x: 0, y: 0, front: false },
  mapWidth: 0,
};

const projected = (point: Vector3, { width, height, focal, eye }: Screen) => {
  const seen = point.clone().sub(eye);
  return { x: width / 2 + (seen.x / -seen.z) * focal, y: height / 2 - (seen.y / -seen.z) * focal };
};

/** What a journey reads: nothing while no Earth was asked for, and the state alone while none is on the stage. */
export function earthStats(globe: Globe | undefined, status: Status, screen: Screen): EarthStats | undefined {
  if (globe === undefined) return status.state === "gone" ? undefined : { ...status, ...NOWHERE };
  const centre = globe.group.position;
  const onOrbit = Array.from({ length: ORBIT_SAMPLES }, (_, index) =>
    projected(globe.orbitAt((index / ORBIT_SAMPLES) * TURN).add(centre), screen),
  );
  const moon = globe.moon.group.position;
  return {
    ...status,
    ...projected(centre, screen),
    radius: screen.focal / Math.sqrt(centre.z ** 2 - 1),
    orbit: {
      left: Math.min(...onOrbit.map(({ x }) => x)),
      right: Math.max(...onOrbit.map(({ x }) => x)),
      top: Math.min(...onOrbit.map(({ y }) => y)),
      bottom: Math.max(...onOrbit.map(({ y }) => y)),
    },
    moon: { ...projected(moon.clone().add(centre), screen), front: moon.z > 0 && moon.length() >= ORBIT_RADIUS - 1e-6 },
    mapWidth: globe.mapWidth,
  };
}
