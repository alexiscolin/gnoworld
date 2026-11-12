// The planet the pointer or the keyboard is on in the Map: its links and the worlds they reach light, the rest dims. The lights are the lens's
// own (uLens, aLit), so the GPU does the fading; this only says which worlds, once per change, never per frame.
import type { Planet } from "./layout.ts";
import type { Space } from "./scene.ts";

// Per space: the planet on, the worlds it lights, and whether the planets' lights were written for it.
interface State {
  planet: Planet | undefined;
  lit: ReadonlySet<string> | undefined;
  written: boolean;
}
const states = new WeakMap<Space, State>();
const stateOf = (space: Space): State => {
  const state = states.get(space) ?? { planet: undefined, lit: undefined, written: false };
  states.set(space, state);
  return state;
};

/** The worlds the pointed planet lights; none, none is pointed at. */
export const hoverLit = (space: Space): ReadonlySet<string> | undefined => states.get(space)?.lit;

/** Points `space` at `planet` (none: leaves it); only the Map, where every planet is drawn and named, shows it. */
export function hoverOver(space: Space, planet: Planet | undefined): void {
  const state = stateOf(space);
  const next = space.plan ? planet : undefined;
  if (next === state.planet) return;
  space.touch();
  state.planet = next;
  const { lens, universe, stage } = space;
  const near = stage.links.point(next);
  state.lit = lens === undefined || near === undefined ? near : new Set([...near].filter((id) => lens.has(id)));
  space.labels.lit = state.lit;
  if (universe === undefined) return;
  if (state.lit !== undefined) stage.light(universe, state.lit);
  else if (lens !== undefined) stage.light(universe, lens);
  state.written ||= state.lit !== undefined;
}

/** Once per frame: leaves the Map's hover where the Map is gone, and lights the planets again once the dimming of a pointer that left has
 * eased out (a lens's stay as it set them). */
export function settleHover(space: Space): void {
  const state = stateOf(space);
  if (!space.plan) hoverOver(space, undefined);
  const { universe, stage, lens } = space;
  if (!state.written || state.lit !== undefined || lens !== undefined || stage.frame.uLens.value > 1e-3) return;
  state.written = false;
  if (universe !== undefined) stage.light(universe, undefined);
}
