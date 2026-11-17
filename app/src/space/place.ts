// Where space is asked to be: the home's system, the universe, a namespace's system, or a world's planet.
import { EARTH } from "@gnoworld/core";
import type { Planet, System, Universe } from "./layout.ts";

export type Place =
  | { readonly kind: "home" }
  | { readonly kind: "universe" }
  | { readonly kind: "system"; readonly id: string }
  | { readonly kind: "world"; readonly id: string };

/** Whether `a` and `b` are the same place. */
export const sameAs = (a: Place, b: Place): boolean =>
  a.kind === b.kind && ("id" in a ? a.id : "") === ("id" in b ? b.id : "");

/** The planet `place` is in `universe`: a world's alone. */
export const planetAt = (universe: Universe | undefined, place: Place | undefined): Planet | undefined =>
  place?.kind === "world" ? universe?.byId.get(place.id) : undefined;

/** The system `place` is in, in `universe`: the home's, a namespace's, a world's own; none far out. */
export function systemAt(universe: Universe | undefined, place: Place | undefined): System | undefined {
  if (place === undefined || place.kind === "universe") return undefined;
  if (place.kind === "home") return universe?.home;
  return place.kind === "system" ? universe?.bySystem.get(place.id) : planetAt(universe, place)?.system;
}

/** Whether going to `place` brings the Earth close: the home's first screen, or the Earth's own page. */
export const bringsEarth = (place: Place): boolean =>
  place.kind === "home" || (place.kind === "world" && place.id === EARTH);
