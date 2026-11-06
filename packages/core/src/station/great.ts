// An artificial world's great parts, for the largest stations: a great wheel far out on many spokes, its wall lit, or a shell of cells round
// the hub, open where its draws leave gaps. Each is shaped by continuous draws (reach, tilt, bands, how much of the shell is built).
import type { Draws } from "./draws.ts";
import { beam, lamp } from "./around.ts";
import { at, plus, round, type Part } from "./parts.ts";

/** A great wheel round the hub, `reach` far: a band or a thick ring, tilted off the spine a little, on 6 to 16 spokes. */
export function greatWheelOf(draws: Draws, reach: number): Part[] {
  const band = draws.chance(0.6);
  const centre = at(0, draws.between(-0.2, 0.2) * reach, 0);
  const wall: Part = {
    kind: band ? "band" : "ring",
    finish: draws.one(["hull", "pale", "dark"]),
    at: centre,
    axis: { x: 0, y: 1, z: 0 },
    size: band ? at(reach, reach * draws.between(0.04, 0.12), reach) : at(reach, reach * draws.between(1.5, 3), reach),
    wheel: true,
  };
  const spokes = draws.count(6, 16);
  const turn = draws.unit() * Math.PI;
  const parts: Part[] = [wall];
  for (let index = 0; index < spokes; index += 1) {
    const way = round(turn + (index * 2 * Math.PI) / spokes);
    parts.push(beam([centre, plus(centre, way, reach)], 0.012 * reach, true));
  }
  const lights = draws.count(4, 14);
  for (let index = 0; index < lights; index += 1)
    parts.push(
      lamp(plus(centre, round(turn + (index + 0.5) * ((2 * Math.PI) / lights)), reach * 1.01), 0.012 * reach, true),
    );
  return parts;
}

/** A shell of cells round the hub, `reach` far: bands of latitude, each a ring of tiles, a share of them built, the rest open. */
export function shellOf(draws: Draws, reach: number): Part[] {
  const bands = draws.count(4, 9);
  const built = draws.between(0.35, 0.9);
  const twist = draws.unit();
  const cap = draws.between(0.55, 0.95) * (Math.PI / 2);
  const parts: Part[] = [];
  for (let band = 0; band < bands; band += 1) {
    const latitude = -cap + ((band + 0.5) * 2 * cap) / bands;
    const across = Math.cos(latitude) * reach;
    const tiles = Math.max(4, Math.round((2 * Math.PI * across) / ((2 * cap * reach) / bands)));
    const tall = (cap * reach) / bands;
    for (let tile = 0; tile < tiles; tile += 1) {
      if (!draws.chance(built)) continue;
      const angle = ((tile + twist * band) * 2 * Math.PI) / tiles;
      const out = {
        x: Math.cos(latitude) * Math.cos(angle),
        y: Math.sin(latitude),
        z: Math.cos(latitude) * Math.sin(angle),
      };
      const side = (Math.PI * across) / tiles;
      parts.push({
        kind: "panel",
        finish: draws.chance(0.12) ? "gold" : "cells",
        at: at(out.x * reach, out.y * reach, out.z * reach),
        axis: {
          x: -Math.sin(latitude) * Math.cos(angle),
          y: Math.cos(latitude),
          z: -Math.sin(latitude) * Math.sin(angle),
        },
        face: out,
        size: at(side * 0.92, tall * 0.92, 0.01 * reach),
        wheel: false,
      });
    }
  }
  return parts;
}
