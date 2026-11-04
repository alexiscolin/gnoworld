// What joins a station's spine: its wheels (a ring or a habitat's band on spokes), its arms with what ends them, its wings of cells and its
// dishes. How many of each and where come from the station's draws and its size; none is picked whole from a set of models.
import type { Point } from "../space/cell.ts";
import type { Draws } from "./draws.ts";
import { at, plus, round, UP, type Finish, type Part } from "./parts.ts";
import type { Spine } from "./spine.ts";

const DOWN: Point = { x: 0, y: -1, z: 0 };

/** A truss from one end to the other, `width` its half width. */
export function beam([from, to]: readonly [Point, Point], width: number, wheel = false): Part {
  const length = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  const axis = length === 0 ? UP : at((to.x - from.x) / length, (to.y - from.y) / length, (to.z - from.z) / length);
  const centre = at((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
  return { kind: "truss", finish: "dark", at: centre, axis, size: at(width, length / 2, width), wheel };
}

interface Where {
  readonly at: Point;
  readonly size: Point;
  readonly axis?: Point;
}

const placed = (kind: Part["kind"], finish: Finish, { at: centre, size, axis = UP }: Where): Part => ({
  kind,
  finish,
  at: centre,
  axis,
  size,
  wheel: false,
});

/** A light on `centre`. */
export const lamp = (centre: Point, radius: number, wheel = false): Part => ({
  ...placed("beacon", "lamp", { at: centre, size: at(radius, radius, radius) }),
  wheel,
});

/** One wheel round the spine at one of its anchors: a thin ring or a band, on 2 to 8 spokes, lights round it where the draw says. */
export function wheelOf(draws: Draws, spine: Spine, size: number): Part[] {
  const y = draws.one([0, ...spine.anchors]);
  const reach = spine.core * draws.between(2.4, 5) * (1 + size);
  const band = draws.chance(0.3 + 0.35 * size);
  const centre = at(0, y, 0);
  const ring: Part = band
    ? {
        ...placed("band", draws.one(["hull", "pale", "dark"]), {
          at: centre,
          size: at(reach, reach * draws.between(0.07, 0.22), reach),
        }),
        wheel: true,
      }
    : {
        ...placed("ring", draws.one(["hull", "pale"]), {
          at: centre,
          size: at(reach, reach * draws.between(0.6, 1.8), reach),
        }),
        wheel: true,
      };
  const spokes = draws.count(band ? 3 : 2, 8);
  const turn = draws.unit() * Math.PI;
  const parts: Part[] = [ring];
  for (let index = 0; index < spokes; index += 1) {
    const way = round(turn + (index * 2 * Math.PI) / spokes);
    parts.push(beam([plus(centre, way, spine.core), plus(centre, way, reach)], 0.025 * (1 + size), true));
  }
  const lights = draws.chance(0.6) ? draws.count(2, 6) : 0;
  for (let index = 0; index < lights; index += 1)
    parts.push(lamp(plus(centre, round(turn + index * 1.9), reach), 0.03, true));
  return parts;
}

// What ends an arm at `tip`, pointing `way`: a module across, a ball, a dish looking out, or a light alone.
function armEnd(draws: Draws, tip: Point, way: Point): Part[] {
  const kind = draws.count(0, 3);
  const radius = draws.between(0.07, 0.18);
  if (kind === 0)
    return [
      placed("module", draws.one(["hull", "gold", "pale"]), {
        at: tip,
        size: at(radius, radius * draws.between(1.5, 3.5), radius),
        axis: way,
      }),
    ];
  if (kind === 1)
    return [placed("sphere", draws.one(["hull", "gold", "dark"]), { at: tip, size: at(radius, radius, radius) })];
  if (kind === 2)
    return [
      placed("dish", "pale", {
        at: plus(tip, way, radius * 0.3),
        size: at(radius * 2, radius * 2, radius * 2),
        axis: way,
      }),
    ];
  return [lamp(tip, 0.035)];
}

/** Arms out from the spine, one height, at uneven turns, each ended by what its draw says. */
export function armsOf(draws: Draws, spine: Spine, size: number): Part[] {
  const count = draws.count(1, 2 + Math.floor(3 * size));
  const y = draws.one([0, ...spine.anchors]);
  const start = draws.unit() * 2 * Math.PI;
  const parts: Part[] = [];
  for (let index = 0; index < count; index += 1) {
    const way = round(start + ((index + draws.between(-0.18, 0.18)) * 2 * Math.PI) / count);
    const from = plus(at(0, y, 0), way, spine.core);
    const tip = plus(from, way, draws.between(0.35, 1.2) * (0.8 + size));
    parts.push(beam([from, tip], 0.03), ...armEnd(draws, tip, way));
  }
  return parts;
}

/** A pair of wings of cells, one each side of the spine, on a boom: one to five cells a wing, turned to the light alike. */
export function wingsOf(draws: Draws, spine: Spine): Part[] {
  const y = draws.between(spine.bottom, spine.top);
  const way = round(draws.unit() * 2 * Math.PI);
  const cells = draws.count(1, 4);
  const [width, length] = [draws.between(0.22, 0.5), draws.between(0.2, 0.5)];
  const tilt = draws.between(-0.6, 0.6);
  const parts: Part[] = [];
  for (const side of [1, -1]) {
    const out = at(way.x * side, 0, way.z * side);
    const root = plus(at(0, y, 0), out, spine.core);
    const end = plus(root, out, 0.06 + cells * (2 * length + 0.03));
    parts.push(beam([root, end], 0.02));
    for (let cell = 0; cell < cells; cell += 1) {
      const centre = plus(root, out, 0.06 + length + cell * (2 * length + 0.03));
      const face = plus(at(0, Math.cos(tilt), 0), at(-out.z, 0, out.x), Math.sin(tilt));
      parts.push({ ...placed("panel", "cells", { at: centre, size: at(width, length, 0.012), axis: out }), face });
    }
  }
  return parts;
}

/** A dish at one end of the spine or on its side, on a short mount. */
export function dishOf(draws: Draws, spine: Spine): Part[] {
  const radius = draws.between(0.15, 0.45);
  const end = draws.count(0, 2);
  const way = end === 0 ? UP : end === 1 ? DOWN : round(draws.unit() * 2 * Math.PI);
  const base =
    end === 0 ? at(0, spine.top, 0) : end === 1 ? at(0, spine.bottom, 0) : at(0, draws.one([0, ...spine.anchors]), 0);
  const from = end === 2 ? plus(base, way, spine.core) : base;
  const mount = plus(from, way, radius * 0.5);
  return [
    beam([from, mount], 0.025),
    placed("dish", draws.one(["pale", "hull", "gold"]), { at: mount, size: at(radius, radius, radius), axis: way }),
  ];
}
