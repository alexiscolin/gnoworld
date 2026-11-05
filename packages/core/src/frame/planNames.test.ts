import { describe, expect, it } from "vitest";
import { systemsOf } from "../cosmos/system.ts";
import { planOf } from "./plan.ts";
import { boxOf, meet, namesOf } from "./planNames.ts";
import { along, cameraTowards, looksFrom, placeOf } from "./restLook.ts";

// A Plan's names, pinned where StrykerJS found planNames.ts loose (8r, 2026-11-05): plan.test.ts reads them through planOf; these call
// namesOf on the Plans of systems named crowd<n>, found by a search where each rule decides.
describe("a name's box", () => {
  const box = (left: number, top: number) => ({ left, right: left + 10, top, bottom: top + 10 });

  it("meets another only where they overlap: two that touch on a side, any side, leave each other clear", () => {
    const middle = box(0, 0);
    for (const touching of [box(10, 0), box(-10, 0), box(0, 10), box(0, -10)]) {
      expect(meet(middle, touching)).toBe(false);
      expect(meet(touching, middle)).toBe(false);
    }
    for (const over of [box(9, 0), box(-9, 0), box(0, 9), box(0, -9)]) {
      expect(meet(middle, over)).toBe(true);
      expect(meet(over, middle)).toBe(true);
    }
  });

  it("holds a world's disc and, named, a name's room under it, 120 pixels wide at the least and 30 high", () => {
    expect(boxOf({ x: 100, y: 50, radius: 20 }, false)).toEqual({ left: 80, right: 120, top: 30, bottom: 70 });
    expect(boxOf({ x: 100, y: 50, radius: 20 })).toEqual({ left: 40, right: 160, top: 30, bottom: 100 });
    expect(boxOf({ x: 100, y: 50, radius: 80 })).toEqual({ left: 20, right: 180, top: -30, bottom: 160 });
  });
});

describe("namesOf", () => {
  // The Plan of `crowd<at>`, its 6 to 14 worlds' uses spread, and namesOf's arguments for it: its system, worlds and camera.
  const crowdPlan = (at: number) => {
    const namespace = `crowd${String(at)}`;
    const system = systemsOf(
      Array.from({ length: 6 + (at % 9) }, (_, w) => ({
        id: `${namespace}/w${String(w)}`,
        namespace,
        use: (at * w * 7) % 11,
      })),
    ).find(({ id }) => id === namespace);
    if (system === undefined) throw new Error(`no system ${namespace}`);
    const plan = planOf(system);
    const { lens } = plan;
    if (lens === undefined) throw new Error("a Plan has its own lens");
    const camera = cameraTowards(plan.eye, plan.look, plan.up);
    return { plan, system: plan.postcard.system, worlds: plan.postcard.worlds, camera, lens };
  };
  const ids = (at: number, worlds: readonly number[]) => worlds.map((w) => `crowd${String(at)}/w${String(w)}`);

  it("names every world of a Plan that is not crowded, as asked", () => {
    const { system, worlds, camera, lens } = crowdPlan(26);
    const { named, host } = namesOf(system, worlds, { camera, lens, crowded: false });
    expect([...named].sort()).toEqual(worlds.map(({ id }) => id).sort());
    expect(host).toBeUndefined();
  });

  it("names every world of a crowded Plan with room for all, and stands no +N", () => {
    const { system, worlds, camera, lens } = crowdPlan(0);
    const { named, host } = namesOf(system, worlds, { camera, lens, crowded: true });
    expect(named.size).toBe(worlds.length);
    expect(host).toBeUndefined();
  });

  // crowd26's smallest are w13 and w2 (0.044); its largest w9 (0.071) has no room; w7 (0.069) is the largest named.
  it("names the largest first, and gives the +N the place of the smallest named world that must go", () => {
    const { system, worlds, camera, lens } = crowdPlan(26);
    const { named, host } = namesOf(system, worlds, { camera, lens, crowded: true });
    for (const id of ids(26, [1, 5, 7])) expect(named.has(id), id).toBe(true);
    for (const id of ids(26, [13, 2, 9])) expect(named.has(id), id).toBe(false);
    expect(host).toBe(ids(26, [2])[0]);
  });

  it("stands the +N's room under its world's disc", () => {
    const { system, worlds, camera, lens } = crowdPlan(17);
    const { named, host } = namesOf(system, worlds, { camera, lens, crowded: true });
    expect(host).toBe(ids(17, [13])[0]);
    expect(named.has(ids(17, [5])[0] ?? "")).toBe(true);
  });

  // crowd26's largest world is w9 (0.071).
  it("names no world where none stands on a screen, and gives the +N the largest's place", () => {
    const { system, worlds, camera, lens, plan } = crowdPlan(26);
    const distance = Math.hypot(plan.eye.x - plan.look.x, plan.eye.y - plan.look.y, plan.eye.z - plan.look.z);
    const away = cameraTowards(plan.eye, along(plan.look, camera.right, 5 * distance), plan.up);
    const { named, host } = namesOf(system, worlds, { camera: away, lens, crowded: true });
    expect(named.size).toBe(0);
    expect(host).toBe(ids(26, [9])[0]);
  });

  // The eye turned aside, some names and +N's places stand whole on the wide screen alone. The +N's room under its world is a name's room
  // under a point at the foot of the world's disc.
  it("names a world and stands the +N only where they stand whole on every screen, the eye turned off the Plan's centre", () => {
    const { system, worlds, camera, lens, plan } = crowdPlan(0);
    const distance = Math.hypot(plan.eye.x - plan.look.x, plan.eye.y - plan.look.y, plan.eye.z - plan.look.z);
    const aside = cameraTowards(plan.eye, along(plan.look, camera.right, -0.15 * 0.6 * distance), plan.up);
    const { named, host } = namesOf(system, worlds, { camera: aside, lens, crowded: true });
    expect(named.size).toBeGreaterThan(0);
    expect(host).toBeDefined();
    for (const look of looksFrom(aside, lens))
      for (const world of worlds) {
        const spot = look.seen(placeOf(system, world, 0), world.radius);
        const name = `${world.id} on ${String(look.width)}`;
        if (named.has(world.id)) expect(look.whole({ ...boxOf(spot), depth: spot.depth }, 16), name).toBe(true);
        const under = boxOf({ x: spot.x, y: spot.y + spot.radius, radius: 0 });
        if (world.id === host) expect(look.whole({ ...under, depth: spot.depth }, 16), name).toBe(true);
      }
  });
});
