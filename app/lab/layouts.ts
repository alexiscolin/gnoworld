// Where the realism page's views put their camera, their worlds and their star: a gallery's grid, one world close, a nebula's corner.
import { PerspectiveCamera, Vector3 } from "three";
import type { Planet } from "../src/scene/planet/planet.ts";
import type { ViewName } from "./views.ts";

const GALLERY = { fov: 20, distance: 30, columns: 4, rows: 3, fill: 0.74 };
const CLOSE = { fov: 30, distance: 5.75 };
const FAR_PLANE = 4000;

export interface Layout {
  readonly camera: PerspectiveCamera;
  /** One star for every world, or none: each world then stands in its own light. */
  readonly sun: Vector3 | undefined;
  place(planet: Planet, index: number, aspect: number): void;
}

function galleryLayout(): Layout {
  const camera = new PerspectiveCamera(GALLERY.fov, 1.6, 1, FAR_PLANE);
  camera.position.z = GALLERY.distance;
  const height = 2 * GALLERY.distance * Math.tan((GALLERY.fov * Math.PI) / 360);
  return {
    camera,
    sun: undefined,
    place(planet, index, aspect) {
      const width = height * aspect;
      const column = index % GALLERY.columns;
      const row = Math.floor(index / GALLERY.columns);
      const cellWidth = width / GALLERY.columns;
      const cellHeight = height / GALLERY.rows;
      planet.group.position.set((column + 0.5) * cellWidth - width / 2, height / 2 - (row + 0.5) * cellHeight, 0);
      // A ringed world is drawn smaller, its rings kept inside its cell and on the screen.
      const room = Math.min(cellWidth, cellHeight) / 2;
      planet.group.scale.setScalar(Math.min(room * GALLERY.fill, (room * 1.1) / (planet.look.rings?.outer ?? 1)));
    },
  };
}

function closeLayout(sun: Vector3 | undefined): Layout {
  const camera = new PerspectiveCamera(CLOSE.fov, 1.6, 0.5, FAR_PLANE);
  camera.position.z = CLOSE.distance;
  return { camera, sun: sun?.normalize(), place: () => undefined };
}

function nebulaLayout(): Layout {
  const camera = new PerspectiveCamera(CLOSE.fov, 1.6, 0.5, FAR_PLANE);
  camera.position.z = 22;
  return {
    camera,
    sun: new Vector3(-0.8, 0.3, 0.52).normalize(),
    place(planet, _, aspect) {
      planet.group.position.set(3.2 * aspect, -2.3, 0);
    },
  };
}

export function layoutOf(view: ViewName): Layout {
  if (view === "gallery") return galleryLayout();
  if (view === "close") return closeLayout(undefined);
  if (view === "eclipse") return closeLayout(new Vector3(0.178, 0.1, -1));
  return nebulaLayout();
}
