// Where the Earth stands on the screen, for the journeys, which read no pixel of the canvas to hold its geometry.
import type { Screen } from "./marks.ts";
import { Vector3 } from "three";
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
  /** Frames drawn since it came. */
  readonly drawn: number;
}

interface Status {
  readonly state: EarthState;
  readonly turn: number;
  readonly drawn: number;
}

const NOWHERE = {
  x: 0,
  y: 0,
  radius: 0,
  orbit: { left: 0, right: 0, top: 0, bottom: 0 },
  moon: { x: 0, y: 0, front: false },
  mapWidth: 0,
};

// Through the camera itself: the place a test reads must be the one drawn, and never the sum that placed it.
const projected = (point: Vector3, { width, height, camera }: Screen) => {
  const { x, y } = point.clone().project(camera);
  return { x: ((x + 1) / 2) * width, y: ((1 - y) / 2) * height };
};

// The edge of the disc, on the sphere's circle of contact with the eye's cone, in the camera's own axes: the camera may look about.
function limbRadius(distance: number, screen: Screen): number {
  const { quaternion } = screen.camera;
  const centre = projected(new Vector3(0, 0, -distance).applyQuaternion(quaternion), screen);
  const contact = new Vector3(Math.sqrt(1 - 1 / distance ** 2), 0, 1 / distance - distance).applyQuaternion(quaternion);
  return projected(contact, screen).x - centre.x;
}

/** What a journey reads: nothing while no Earth was asked for, and the state alone while none is on the stage. */
export function earthStats(globe: Globe | undefined, status: Status, screen: Screen): EarthStats | undefined {
  if (globe === undefined) return status.state === "gone" ? undefined : { ...status, ...NOWHERE };
  screen.camera.updateMatrixWorld();
  const { position: centre, quaternion } = globe.group;
  const onOrbit = Array.from({ length: ORBIT_SAMPLES }, (_, index) =>
    projected(
      globe
        .orbitAt((index / ORBIT_SAMPLES) * TURN)
        .applyQuaternion(quaternion)
        .add(centre),
      screen,
    ),
  );
  const moon = globe.moon.group.position;
  const ahead = -centre.clone().applyQuaternion(screen.camera.quaternion.clone().invert()).z;
  return {
    ...status,
    ...projected(centre, screen),
    radius: limbRadius(ahead, screen),
    orbit: {
      left: Math.min(...onOrbit.map(({ x }) => x)),
      right: Math.max(...onOrbit.map(({ x }) => x)),
      top: Math.min(...onOrbit.map(({ y }) => y)),
      bottom: Math.max(...onOrbit.map(({ y }) => y)),
    },
    moon: {
      ...projected(moon.clone().applyQuaternion(quaternion).add(centre), screen),
      front: moon.z > 0 && moon.length() >= ORBIT_RADIUS - 1e-6,
    },
    mapWidth: globe.mapWidth,
  };
}
