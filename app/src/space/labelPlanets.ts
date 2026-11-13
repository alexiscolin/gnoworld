import type { Planet, System } from "./layout.ts";

/** The planets of a system a view may name, the liveliest first, the page's world ahead of them, each list made once. */
export class Planets {
  readonly #byUse = new WeakMap<System, readonly Planet[]>();
  readonly #lit = new Map<System, readonly Planet[]>();
  #first: { readonly marked: Planet; readonly of: readonly Planet[]; readonly list: readonly Planet[] } | undefined;

  /** The lens changed: the lit lists are made anew. */
  clear(): void {
    this.#lit.clear();
  }

  /** `system`'s planets by use: those `only` names when a lens lights, with `marked` first. */
  of(system: System, only: ReadonlySet<string> | undefined, marked: Planet | undefined): readonly Planet[] {
    let planets = this.#byUseOf(system);
    if (only !== undefined) {
      const lit = this.#lit.get(system) ?? planets.filter((planet) => only.has(planet.id));
      this.#lit.set(system, lit);
      planets = lit;
    }
    if (marked === undefined) return planets;
    if (this.#first?.marked !== marked || this.#first.of !== planets)
      this.#first = { marked, of: planets, list: [marked, ...planets.filter((planet) => planet !== marked)] };
    return this.#first.list;
  }

  #byUseOf(system: System): readonly Planet[] {
    let sorted = this.#byUse.get(system);
    if (sorted === undefined) {
      sorted = [...system.planets].sort((a, b) => b.use - a.use);
      this.#byUse.set(system, sorted);
    }
    return sorted;
  }
}
