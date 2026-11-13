// Which system's planets the scene draws: only the system the camera is in or goes to; from the galaxy every system is its sun alone.
// The planets' shader reads three numbers and fades by the scene's clock, so a change costs one write, never a frame's work.
import type { IUniform } from "three";

/** How long a system's planets take to come in, or go, in seconds. */
export const OPEN_S = 0.4;
/** The clock a fade that is already over starts at: reduced motion writes it, so a change shows at once. */
const OVER = -1e4;

/** The uniforms the planets read: the system open now and the one before (an index, -1 none), and the clock when it changed. */
export interface Open {
  readonly uOpenNow: IUniform<number>;
  readonly uOpenWas: IUniform<number>;
  readonly uOpenAt: IUniform<number>;
}

export const openOf = (): Open => ({ uOpenNow: { value: -1 }, uOpenWas: { value: -1 }, uOpenAt: { value: OVER } });

/** Opens the system at `index` (-1: the galaxy) on the clock's `seconds`; `still`: with no fade. Where it is open already, a fade under way
 * ends at once when `still`, whose clock stands; nothing else is written. Returns whether it opened another system. */
export function open(uniforms: Open, index: number, { seconds, still }: { seconds: number; still: boolean }): boolean {
  if (uniforms.uOpenNow.value === index) {
    if (still && uniforms.uOpenAt.value !== OVER) [uniforms.uOpenWas.value, uniforms.uOpenAt.value] = [-1, OVER];
    return false;
  }
  uniforms.uOpenWas.value = still ? -1 : uniforms.uOpenNow.value;
  uniforms.uOpenNow.value = index;
  uniforms.uOpenAt.value = still ? OVER : seconds;
  return true;
}

/** The system whose planets are drawn: the one the camera is in or goes to; on a flight out to the galaxy, `was`, the one it leaves, till it
 * lands: closed at the click, the planet the eye flies from dropped to its quad and faded while it still filled the screen. */
export const openedOf = (
  { system, rig }: { system: { index: number } | undefined; rig: { flying: boolean } },
  was: number,
): number => system?.index ?? (rig.flying ? was : -1);

/** Whether a fade runs at `seconds`: the frames must go on drawing till it is over. */
export const fading = (uniforms: Open, seconds: number): boolean => seconds - uniforms.uOpenAt.value < OPEN_S;
