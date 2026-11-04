// The Earth's system's study in the lab (part 7x): what its two pages share, the sample's names and sizes, the map on the stage, the station
// orbits drawn from above, the names over the stations and the stations' light.
import { EARTH_PLACE, toScene, type PlacedStation, type Point } from "@gnoworld/core";
import {
  AmbientLight,
  BufferGeometry,
  DirectionalLight,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  type PerspectiveCamera,
  type Scene,
  Vector3,
} from "three";
import type { View } from "./views.ts";

/** Names to seed the study's stations with: gnosh.ai, then the sample's. */
export const SAMPLE = [
  "gnosh.ai",
  "gnoweb",
  "gnokey",
  "gnopls",
  "gnodev",
  "tx-indexer",
  "adena",
  "gnoscan",
  "gnoswap",
  "onbloc",
  "teritori",
  "berty",
  "memba",
  "gnolove",
  "playground",
  "gnobro",
  "gnoverse",
  "boards",
  "govdao",
  "faucet",
] as const;

// The study's sizes past gnosh.ai's: spread, one artificial world, the rest satellites and stations; a thousand by their index.
export const sizeOf = (index: number, first: number) =>
  index === 0 ? first : ([0.95, 0.15, 0.55, 0.05, 0.35, 0.25, 0.7, 0.1, 0.45, 0][index % 10] ?? 0);
export const nameOf = (index: number) => SAMPLE[index] ?? `project-${String(index)}`;

export const scene = (point: Point) => {
  const out = { x: 0, y: 0, z: 0 };
  toScene(point, out);
  return new Vector3(out.x, out.y, out.z);
};

// The orbits of the close stations, one line set: drawn only from above.
export function orbitsOf(close: readonly PlacedStation[], earth: Vector3): LineSegments {
  const points: number[] = [];
  for (const { orbit } of close) {
    const ring = Array.from({ length: 129 }, (_, at) => {
      const phase = (at * 2 * Math.PI) / 128;
      const [x, z] = [orbit.reach * Math.cos(phase), orbit.reach * Math.sin(phase)];
      const [y, flat] = [z * Math.sin(orbit.tilt), z * Math.cos(orbit.tilt)];
      const map = {
        x: EARTH_PLACE.x + x * Math.cos(orbit.node) - flat * Math.sin(orbit.node),
        y: EARTH_PLACE.y + y,
        z: EARTH_PLACE.z + x * Math.sin(orbit.node) + flat * Math.cos(orbit.node),
      };
      return scene(map).sub(earth);
    });
    ring.slice(1).forEach((point, at) => {
      const last = ring[at] ?? point;
      points.push(last.x, last.y, last.z, point.x, point.y, point.z);
    });
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(points, 3));
  return new LineSegments(
    geometry,
    new LineBasicMaterial({ color: 0xfff0dd, transparent: true, opacity: 0.09, depthWrite: false }),
  );
}

/** The great star's light on the stations, from `toStar`, and a dim fill so their shade still reads. */
export const lightsOf = (toStar: Vector3) => {
  const sun = new DirectionalLight(0xfff1dc, 3.2);
  sun.position.copy(toStar);
  return [sun, sun.target, new AmbientLight(0x8090b0, 0.55)];
};

/** Names over `close` stations, as pills, set on the screen at each `place`, gone at `remove`. */
export function namesOf(close: readonly PlacedStation[], { eye, up }: { eye: Vector3; up: Vector3 }) {
  const named = close.map((placed) => {
    const label = Object.assign(document.createElement("span"), {
      textContent: placed.seed,
      className: "station-name",
    });
    document.body.append(label);
    return {
      label,
      over: scene(placed.place)
        .sub(eye)
        .addScaledVector(up, placed.radius * 1.1),
    };
  });
  return {
    place(camera: PerspectiveCamera) {
      camera.updateMatrixWorld();
      for (const { label, over } of named) pin(label, over, camera);
    },
    remove() {
      for (const { label } of named) label.remove();
    },
  };
}

/** Sets `label` on the screen where `camera` sees `point`. */
export function pin(label: HTMLElement, point: Vector3, camera: PerspectiveCamera): void {
  const seen = point.clone().project(camera);
  label.style.left = `${String(((seen.x + 1) / 2) * innerWidth)}px`;
  label.style.top = `${String(((1 - seen.y) / 2) * innerHeight)}px`;
}

/** A study's view: its stage through `camera`, which follows the screen's shape, then `looked`; no worlds of the gallery's. */
export function studyView(
  { stage, camera }: { stage: Scene; camera: PerspectiveCamera },
  { looked, tick, dispose }: { looked: () => void; tick: (seconds: number) => void; dispose: () => void },
): View {
  return {
    stage,
    camera,
    worlds: [],
    drawn: [],
    stages: [],
    textures: [],
    look(_x, _y, aspect) {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      looked();
    },
    tick,
    dispose,
  };
}
