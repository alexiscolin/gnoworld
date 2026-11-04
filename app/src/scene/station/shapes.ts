// The stations' unit shapes and coverings (part 7x): one geometry a kind of part and one material, shared by every station, so a kind is
// one instanced draw however many stations stand. Each part's finish is its instance's colour; a light is drawn unlit.
import type { Finish, PartKind } from "@gnoworld/core";
import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  DataTexture,
  DoubleSide,
  LatheGeometry,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  type BufferGeometry,
  type Material,
} from "three";

// The finishes' colours, in sRGB: a warm and a cool white hull, a dark frame, gold foil, deep blue cells; a lamp's own colour is its light's.
const FINISH_COLOURS: Record<Finish, number> = {
  hull: 0xd8d2c6,
  pale: 0xeef0f2,
  dark: 0x45484e,
  gold: 0xc99a46,
  cells: 0x3a5590,
  lamp: 0xffd7a0,
};
/** A light's colours: warm white, red, white and pale cyan, as a station's beacons. */
export const LAMP_COLOURS = [0xffd7a0, 0xff5c4a, 0xffffff, 0x9fe6ff] as const;

export const finishColour = (finish: Finish, out: Color): Color => out.setHex(FINISH_COLOURS[finish], SRGBColorSpace);

// A bowl opening up: a parabola from its centre to its rim, a third as deep as it is wide.
function bowl(): BufferGeometry {
  const rim = Array.from({ length: 9 }, (_, at) => {
    const across = at / 8;
    return new Vector2(Math.max(across, 0.001), 0.33 * across * across);
  });
  return new LatheGeometry(rim, 28);
}

// A ring's tube lies round the y axis.
function ring(): BufferGeometry {
  const torus = new TorusGeometry(1, 0.06, 10, 120);
  torus.rotateX(Math.PI / 2);
  return torus;
}

/** Each kind's unit shape, as parts.ts describes it. */
export function shapesOf(): Record<PartKind, BufferGeometry> {
  return {
    module: new CylinderGeometry(1, 1, 2, 22, 1),
    sphere: new SphereGeometry(1, 22, 14),
    ring: ring(),
    band: new CylinderGeometry(1, 1, 2, 120, 1, true),
    truss: new BoxGeometry(2, 2, 2),
    panel: new BoxGeometry(2, 2, 2),
    dish: bowl(),
    beacon: new SphereGeometry(1, 8, 6),
  };
}

// The cells' grid: dark lines round each cell on a face, the face's own colour between them.
function cellGrid(): DataTexture {
  const side = 32;
  const texels = new Uint8Array(side * side * 4);
  for (let y = 0; y < side; y += 1)
    for (let x = 0; x < side; x += 1) {
      const line = x % 8 === 0 || y % 16 === 0;
      texels.set(line ? [70, 70, 80, 255] : [255, 255, 255, 255], (y * side + x) * 4);
    }
  const grid = new DataTexture(texels, side, side);
  grid.wrapS = RepeatWrapping;
  grid.wrapT = RepeatWrapping;
  grid.colorSpace = SRGBColorSpace;
  grid.needsUpdate = true;
  return grid;
}

/** Each kind's covering: metal for the hull's parts, glass over cells for a panel, a lamp unlit; a band and a bowl seen from inside too. */
export function coveringsOf(): { materials: Record<PartKind, Material>; grid: DataTexture } {
  const grid = cellGrid();
  const metal = (side = false) =>
    new MeshStandardMaterial({ metalness: 0.2, roughness: 0.55, ...(side ? { side: DoubleSide } : {}) });
  return {
    grid,
    materials: {
      module: metal(),
      sphere: metal(),
      ring: metal(),
      band: metal(true),
      truss: new MeshStandardMaterial({ metalness: 0.3, roughness: 0.6 }),
      panel: new MeshStandardMaterial({ metalness: 0.3, roughness: 0.35, map: grid }),
      dish: metal(true),
      beacon: new MeshBasicMaterial(),
    },
  };
}
