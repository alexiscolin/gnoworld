// gnosh's colony, the offset crown (D13740): a Stanford wheel and a second, thinner wheel set off up the spine and leaned, a spine longer
// on its docks' side, mirror petals at its sunward end, a factory out on the wheel, lit lanes along the spokes and round both wheels.
// In its own frame, its spine up; `fine` the near level, else the far one, a third of the sides.
import { BoxGeometry, SphereGeometry, TorusGeometry, type BufferGeometry } from "three";
import { cylinder, onTube, placed, ringOf, strut, type Parts, type Spot, type V3 } from "./shapes.ts";

export type Finish = "habitat" | "hull" | "dark" | "mirror" | "radiator" | "lane" | "gold";

/** A point of the hull a sign stands on: a room's own, or one a message's bubble may take. */
export interface Anchor extends Spot {
  readonly room?: string;
}

// raw: the wheel's radius and its tube's, in the colony's units; the second wheel's radius, height and lean
const WHEEL = { ring: 2.2, tube: 0.34 } as const;
const SECOND = { radius: 1.45, y: 0.95, lean: 0.16 } as const;
// The factory's place round the wheel, and how far past it.
const FACTORY = { round: 3.55, out: 0.95 } as const;

/** The points of the hull the signs stand on, each with its normal: the rooms' first, then more for the bubbles; none in the void. */
export const ANCHORS: readonly Anchor[] = [
  { room: "#gnosh-ai", ...onTube(WHEEL, 0.55, 0.9) },
  { room: "#gnosh-ai/help", ...onTube(WHEEL, 2.35, 0.9) },
  { room: "#gnosh-ai/showcase", at: [0.5 * Math.cos(0.1), 0.15, 0.5 * Math.sin(0.1)], out: [Math.cos(0.1), 0, Math.sin(0.1)] },
  onTube(WHEEL, 1.6, 0.8),
  onTube(WHEEL, 5.6, 0.85),
  onTube(WHEEL, 4.3, 0.7),
];

/** The rooms' own points: #general on the wheel, #help across it, #showcase on the hub. */
export const ROOM_ANCHORS: readonly Anchor[] = ANCHORS.filter(({ room }) => room !== undefined);

function push(parts: Parts<Finish>, finish: Finish, ...geometries: BufferGeometry[]): void {
  (parts[finish] ??= []).push(...geometries);
}

// The wheel, its ribs near, the second wheel, both wheels' lanes, the spokes and their lanes.
function wheels(parts: Parts<Finish>, fine: boolean): void {
  const sides = fine ? 1 : 0.35;
  const wheel = new TorusGeometry(WHEEL.ring, WHEEL.tube, Math.round(48 * sides), Math.round(220 * sides));
  wheel.rotateX(Math.PI / 2);
  push(parts, "habitat", placed(wheel, { at: [0, 0, 0], uv: [6, 1] }));
  if (fine)
    for (let rib = 0; rib < 40; rib += 1) {
      const round = (rib / 40) * Math.PI * 2;
      const hoop = new TorusGeometry(WHEEL.tube + 0.014, 0.014, 6, 32);
      hoop.rotateY(Math.PI / 2 - round);
      push(parts, "dark", placed(hoop, { at: [Math.cos(round) * WHEEL.ring, 0, Math.sin(round) * WHEEL.ring] }));
    }
  push(parts, "hull", ringOf({ ...SECOND, tube: 0.13, sides: fine ? 140 : 40 }));
  push(parts, "lane", ringOf({ ...SECOND, tube: 0.02, sides: fine ? 160 : 48 }));
  push(parts, "lane", ringOf({ radius: WHEEL.ring - WHEEL.tube * 0.98, y: 0, tube: 0.018, sides: fine ? 160 : 48 }));
  for (let spoke = 0; spoke < 6; spoke += 1) {
    const round = (spoke / 6) * Math.PI * 2;
    const [x, z] = [Math.cos(round), Math.sin(round)];
    push(parts, "hull", placed(cylinder(0.09, WHEEL.ring - 0.8, fine ? 22 : 8), { at: [x * 1.32, 0, z * 1.32], axis: [x, 0, z], uv: [1, 3] }));
    push(parts, "lane", strut([x * 0.55, 0.1, z * 0.55], [x * (WHEEL.ring - WHEEL.tube), 0.1, z * (WHEEL.ring - WHEEL.tube)]));
  }
  for (let arm = 0; arm < 4; arm += 1) {
    const round = (arm / 4) * Math.PI * 2 + 0.4;
    const y = SECOND.y + Math.sin(round) * SECOND.radius * SECOND.lean;
    push(parts, "dark", strut([Math.cos(round) * 0.3, SECOND.y, Math.sin(round) * 0.3], [Math.cos(round) * 1.35, y, Math.sin(round) * 1.35], 0.035));
  }
}

// The spine and its hub, the mirror petals at its sunward end, the docks down its long end, the factory out on the wheel.
function spine(parts: Parts<Finish>, fine: boolean): void {
  push(parts, "dark", placed(cylinder(0.12, 6.2, 12), { at: [0, 0.15, 0] }));
  push(parts, "hull", placed(cylinder(0.5, 0.9, fine ? 48 : 16), { at: [0, 0, 0], uv: [3, 1] }));
  push(parts, "hull", placed(new SphereGeometry(0.5, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), { at: [0, 0.45, 0], uv: [3, 1] }));
  push(parts, "gold", placed(cylinder(0.34, 0.5), { at: [0, 0.7, 0] }));
  for (let petal = 0; petal < 6; petal += 1) {
    const leaf = new BoxGeometry(0.9, 0.015, 1.6);
    leaf.translate(0, 0, 0.8);
    leaf.rotateX(-0.75);
    leaf.rotateY(-(petal / 6) * Math.PI * 2 + Math.PI / 2);
    push(parts, "mirror", placed(leaf, { at: [0, 3.2, 0] }));
  }
  const docks: readonly V3[] = [
    [0.3, 1.1, -2.2],
    [2.4, 0.7, -2.5],
    [4.1, 1.4, -2.75],
  ];
  for (const [round, length, y] of docks) {
    const [x, z] = [Math.cos(round) * length, Math.sin(round) * length];
    push(parts, "dark", strut([0, y, 0], [x, y, z], 0.04));
    push(parts, "hull", placed(cylinder(0.14, 0.5, 16), { at: [x, y, z] }));
    push(parts, "lane", strut([0, y + 0.05, 0], [x, y + 0.05, z], 0.01));
  }
  const dish = new SphereGeometry(0.42, 32, 8, 0, Math.PI * 2, 0, 0.8);
  dish.rotateX(Math.PI);
  push(parts, "radiator", placed(dish, { at: [0, -3.05, 0] }));
  push(parts, "dark", placed(cylinder(0.01, 0.9, 4), { at: [0.2, -3.35, 0.05] }), placed(cylinder(0.01, 0.6, 4), { at: [-0.15, -3.2, 0.12] }));
  const [fx, fz] = [Math.cos(FACTORY.round) * (WHEEL.ring + FACTORY.out), Math.sin(FACTORY.round) * (WHEEL.ring + FACTORY.out)];
  push(parts, "gold", placed(cylinder(0.22, 1.3), { at: [fx, 0.3, fz], axis: [Math.cos(FACTORY.round), 0.25, Math.sin(FACTORY.round)] }));
  for (const side of [1, -1]) push(parts, "radiator", placed(new BoxGeometry(0.02, 0.8, 0.5), { at: [fx + side * 0.05, 0.3 + side * 0.55, fz] }));
  for (const side of [1, -1]) push(parts, "radiator", placed(new BoxGeometry(1.4, 0.02, 0.45), { at: [side * 0.95, -1.4, 0] }));
}

/** The crown's parts by finish: `fine`, its near level. */
export function crownOf(fine: boolean): Parts<Finish> {
  const parts: Parts<Finish> = {};
  wheels(parts, fine);
  spine(parts, fine);
  return parts;
}
