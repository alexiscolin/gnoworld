// The Earth's system's study in the lab (part 7x): what its two pages share, the sample's names and sizes, the map on the stage and a name
// pinned on the screen. The view itself is the site's (station/earthView.ts).
import { toScene, type Point } from "@gnoworld/core";
import { type PerspectiveCamera, type Scene, Vector3 } from "three";
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
