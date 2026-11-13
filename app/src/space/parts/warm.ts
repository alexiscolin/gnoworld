// The maps of the planets seen next, asked ahead so that nothing seen ever waits for them: the planet pointed at or gone to, every planet
// of the system the page is in (the view one step up, and each world one step down), the nearest systems from the galaxy. Never twice,
// and never ahead of the page's own maps (Maps).
import { EARTH } from "@gnoworld/core";
import { fastLink } from "../../lib/saveData.ts";
import type { Planet, System, Universe, Vec } from "../layout.ts";
import { namesFor } from "../planet/generated.ts";
import type { Maps } from "./maps.ts";

// What is only in view, not asked for, waits for the first screen to have had its moment.
const AFTER_MS = 2500;
// From the galaxy: this many of the nearest systems.
const SYSTEMS = 3;

export class Warm {
  readonly #maps: Maps;
  readonly #born = performance.now();
  readonly #done = new Set<number>();
  readonly #names = new Map<number, string[]>();

  constructor(maps: Maps) {
    this.#maps = maps;
  }

  /** Asks the maps of `planet`; `asked`: it is pointed at, focused or gone to, so it needs no wait. */
  planet(planet: Planet | undefined, asked = false): void {
    if (planet === undefined || this.#done.has(planet.index) || !fastLink()) return;
    if (!asked && performance.now() - this.#born < AFTER_MS) return;
    const names = this.#names.get(planet.index) ?? namesFor(planet.id);
    this.#names.set(planet.index, names);
    if ((planet.id === EARTH ? this.#maps.earth(false) : this.#maps.setOf(names, false)) !== undefined)
      this.#done.add(planet.index);
  }

  /** Asks the maps of every planet of `system`. */
  system(system: System | undefined): void {
    for (const planet of system?.planets ?? []) this.planet(planet, true);
  }

  /** A place is gone to: its planet, its system's planets, or from the galaxy the nearest systems' planets. */
  place({
    planet,
    system,
    universe,
    eye,
  }: {
    planet: Planet | undefined;
    system: System | undefined;
    universe: Universe;
    eye: Vec;
  }): void {
    this.planet(planet, true);
    if (system !== undefined) {
      this.system(system);
      return;
    }
    const away = (from: System) => Math.hypot(from.place.x - eye.x, from.place.y - eye.y, from.place.z - eye.z);
    for (const near of [...universe.systems].sort((a, b) => away(a) - away(b)).slice(0, SYSTEMS)) this.system(near);
  }
}
