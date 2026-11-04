// A station's spine: its modules stacked along +y, a ball or a cylinder each, joined by short trusses, a long truss through some, and the
// heights where the rest joins on. A small satellite is a spine of one or two; an artificial world's is the hub its great parts turn on.
import type { Draws } from "./draws.ts";
import { at, UP, type Finish, type Part } from "./parts.ts";

export interface Spine {
  readonly parts: Part[];
  readonly top: number;
  readonly bottom: number;
  /** Its widest module's radius. */
  readonly core: number;
  /** The heights the rest joins on: each module's centre. */
  readonly anchors: readonly number[];
}

const HULLS: readonly [Finish, ...Finish[]] = ["hull", "hull", "pale", "gold", "dark"];

const piece = (kind: Part["kind"], finish: Finish, [y, size]: readonly [number, Part["size"]]): Part => ({
  kind,
  finish,
  at: at(0, y, 0),
  axis: UP,
  size,
  wheel: false,
});

// One module on the stack from `y` up: a cylinder, a ball or a box (a satellite's bus), as the draw says; its height and radius.
function moduleAt(draws: Draws, y: number, finish: Finish): { part: Part; height: number; radius: number } {
  const radius = draws.between(0.1, 0.3);
  const shape = draws.unit();
  if (shape < 0.22)
    return { part: piece("sphere", finish, [y + radius, at(radius, radius, radius)]), height: 2 * radius, radius };
  const half = draws.between(0.12, 0.55);
  if (shape < 0.45) {
    const box = piece("truss", draws.chance(0.6) ? "gold" : finish, [
      y + half,
      at(radius, half, radius * draws.between(0.6, 1.2)),
    ]);
    return { part: box, height: 2 * half, radius };
  }
  return { part: piece("module", finish, [y + half, at(radius, half, radius)]), height: 2 * half, radius };
}

/** Modules joined on the spine's side at some of its anchors, one to three a node, square to it, as a station grows room by room. */
export function sidesOf(draws: Draws, spine: Spine, size: number): Part[] {
  const parts: Part[] = [];
  for (const y of spine.anchors) {
    if (!draws.chance(0.2 + 0.45 * size)) continue;
    const count = draws.count(1, 3);
    const start = draws.unit() * 2 * Math.PI;
    for (let index = 0; index < count; index += 1) {
      const angle = start + (index * 2 * Math.PI) / count + draws.between(-0.3, 0.3);
      const way = { x: Math.cos(angle), y: 0, z: Math.sin(angle) };
      const [radius, half] = [draws.between(0.07, 0.2), draws.between(0.15, 0.45)];
      const out = spine.core + half;
      const side = { ...piece("module", draws.one(HULLS), [y, at(radius, half, radius)]), axis: way };
      parts.push({ ...side, at: at(way.x * out, y, way.z * out) });
    }
  }
  return parts;
}

/** The spine of a station of `size`, 0 a small satellite to 1 an artificial world. */
export function spineOf(draws: Draws, size: number): Spine {
  const parts: Part[] = [];
  const anchors: number[] = [];
  const count = draws.count(1, 2 + Math.round(2 * size));
  const finish = draws.one(HULLS);
  let y = 0;
  let core = 0;
  for (let index = 0; index < count; index += 1) {
    const own = draws.chance(0.3) ? draws.one(HULLS) : finish;
    const { part, height, radius } = moduleAt(draws, y, own);
    parts.push(part);
    anchors.push(part.at.y);
    core = Math.max(core, radius);
    y += height;
    if (index < count - 1 && draws.chance(0.45)) {
      const gap = draws.between(0.08, 0.4);
      parts.push(piece("truss", "dark", [y + gap / 2, at(0.035, gap / 2, 0.035)]));
      y += gap;
    }
  }
  const lift = -y / 2;
  const centred = parts.map((part) => ({ ...part, at: at(0, part.at.y + lift, 0) }));
  const spine = { parts: centred, top: y / 2, bottom: -y / 2, core, anchors: anchors.map((one) => one + lift) };
  return draws.chance(0.25 + 0.3 * size) ? throughTruss(draws, spine) : spine;
}

// A long truss through the stack, past both its ends, the further anchors at its ends.
function throughTruss(draws: Draws, spine: Spine): Spine {
  const reach = (spine.top - spine.bottom) * draws.between(0.7, 1.6) + 0.3;
  const top = spine.top + reach * draws.unit();
  const bottom = spine.bottom - reach * draws.unit();
  const truss = piece("truss", "dark", [(top + bottom) / 2, at(0.03, (top - bottom) / 2, 0.03)]);
  return { ...spine, parts: [...spine.parts, truss], top, bottom, anchors: [...spine.anchors, top, bottom] };
}
