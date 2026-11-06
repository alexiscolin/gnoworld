// Where the realism page's views put their camera, their worlds and their star: a gallery's grid, one world close.
import { PerspectiveCamera, Vector3 } from "three";
import type { Planet } from "../src/scene/planet/planet.ts";
import type { ViewName } from "./choice.ts";

const GALLERY = { fov: 20, distance: 30 };
// The twelve anchors Alexis approved in a grid of four by three, as he saw them; all 24 in six by four, a little apart from the credits.
const TWELVE = { columns: 4, rows: 3, fill: 0.74 };
const ALL = { columns: 6, rows: 4, fill: 0.7 };
// ADR-0002 §3's variety view: eight classes in frame, four by two.
const EIGHT = { columns: 4, rows: 2, fill: 0.7 };
// A row holds the six stages, the biggest world filling its cell.
const STAGES_ROW = { columns: 6, biggest: 1.6 };
const CLOSE = { fov: 30, distance: 5.75 };
const FAR_PLANE = 4000;

export interface Layout {
  readonly camera: PerspectiveCamera;
  /** One star for every world, or none: each world then stands in its own light. */
  readonly sun: Vector3 | undefined;
  place(planet: Planet, index: number, aspect: number): void;
}

// The far camera of a view of many worlds, and the height it sees at their plane.
function farCamera() {
  const camera = new PerspectiveCamera(GALLERY.fov, 1.6, 1, FAR_PLANE);
  camera.position.z = GALLERY.distance;
  return { camera, height: 2 * GALLERY.distance * Math.tan((GALLERY.fov * Math.PI) / 360) };
}

function galleryLayout({ columns, rows, fill }: { columns: number; rows: number; fill: number }): Layout {
  const { camera, height } = farCamera();
  return {
    camera,
    sun: undefined,
    place(planet, index, aspect) {
      const width = height * aspect;
      const column = index % columns;
      const row = Math.floor(index / columns);
      const cellWidth = width / columns;
      const cellHeight = height / rows;
      planet.group.position.set((column + 0.5) * cellWidth - width / 2, height / 2 - (row + 0.5) * cellHeight, 0);
      // A ringed world is drawn smaller, its rings kept inside its cell and on the screen.
      const room = Math.min(cellWidth, cellHeight) / 2;
      planet.group.scale.setScalar(Math.min(room * fill, (room * 1.1) / (planet.look.rings?.outer ?? 1)));
    },
  };
}

// The stages of one world side by side, each at its own size.
function stagesLayout(sizes: readonly number[]): Layout {
  const { camera, height } = farCamera();
  return {
    camera,
    sun: undefined,
    place(planet, index, aspect) {
      const cell = (height * aspect) / STAGES_ROW.columns;
      planet.group.position.set((index + 0.5) * cell - (height * aspect) / 2, 0, 0);
      const rings = Math.max(1, (planet.look.rings?.outer ?? 1) / STAGES_ROW.biggest);
      planet.group.scale.setScalar(((cell / 2 / STAGES_ROW.biggest) * (sizes[index] ?? 1)) / rings);
    },
  };
}

function closeLayout(sun: Vector3 | undefined): Layout {
  const camera = new PerspectiveCamera(CLOSE.fov, 1.6, 0.5, FAR_PLANE);
  camera.position.z = CLOSE.distance;
  return { camera, sun: sun?.normalize(), place: () => undefined };
}

export function layoutOf(view: ViewName, sizes: readonly number[]): Layout {
  if (view === "gallery") return galleryLayout(TWELVE);
  if (view === "gallery24" || view === "real24" || view === "class24") return galleryLayout(ALL);
  if (view === "variety") return galleryLayout(EIGHT);
  if (view === "stages") return stagesLayout(sizes);
  if (view === "eclipse") return closeLayout(new Vector3(0.178, 0.1, -1));
  return closeLayout(undefined);
}
