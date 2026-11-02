// What a world's view says of itself, for the journeys and `?debug`: made when asked, never on a frame.
import type { StatusOrbit } from "@gnoworld/core";
import type { Vector3, Vector4 } from "three";
import type { EarthState } from "../earth/device.ts";
import type { WorldReading } from "./reading.ts";
import type { Standing } from "./standing.ts";

interface Held {
  readonly state: EarthState;
  readonly standing: Standing | undefined;
  readonly centre: Vector3 | undefined;
  readonly disc: number;
  readonly fit: number;
  readonly wake: number;
  readonly orbit: StatusOrbit | undefined;
  readonly reading: WorldReading | undefined;
  readonly shadows: number;
  readonly sun: Vector3;
}

// The ring's moon is in front when it stands nearer the eye than the world's centre.
function ringOf({ standing, orbit }: Held) {
  const body = standing?.body;
  if (orbit === undefined || body === undefined) return undefined;
  const at = body.ringMoon.group.getWorldPosition(body.group.position.clone());
  return { ...orbit, front: at.z > body.group.position.z };
}

const signsOf = (reading: WorldReading | undefined) => ({
  aurora: reading?.aurora ?? 0,
  storms: [...(reading?.storms ?? [0, 0, 0])],
  heat: reading?.heat ?? 0,
});

// The casters as the overlay holds them: what the shader reads.
function castersOf({ standing, shadows }: Held) {
  const occluders = (standing?.body?.overlay.uniforms["occluders"]?.value ?? []) as Vector4[];
  return occluders.slice(0, shadows).map(({ x, y, z, w }) => ({ centre: { x, y, z }, radius: w }));
}

/** The view's state, read off what it keeps. */
export function statsOf(held: Held) {
  const { standing, centre, sun } = held;
  return {
    state: held.state,
    anchor: standing?.look.anchor,
    centre: { x: centre?.x ?? 0, y: centre?.y ?? 0, radius: held.disc },
    size: held.fit,
    wake: held.wake,
    ring: ringOf(held),
    signs: signsOf(held.reading),
    moons: (standing?.moons?.spots ?? []).map((spot) => ({ ...spot })),
    shadows: held.shadows,
    casters: castersOf(held),
    sun: { x: sun.x, y: sun.y, z: sun.z },
  };
}
