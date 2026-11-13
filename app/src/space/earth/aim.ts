// Which spin and which lean show a country where Alexis's frames keep it (D13916): the spins within half a turn of where the ground stands and
// the leans toward the eye within TILT are tried, and the pair that stands the country nearest the aim while it is well seen wins.
interface Point {
  readonly x: number;
  readonly y: number;
}

// raw: the leans toward the eye reach 70 degrees at most (Japan's 36 N needs about 40 to stand in the middle, Iceland's 65 N about 65), tried in 5 degree steps, the spins in 4 degree ones half a turn round
const TILT = (70 * Math.PI) / 180;
const TILTS = 14;
export const AIM_STEP = Math.PI / 45;
const LEADS = 45;
// What a radian of turn costs in pixels from the aim: of the pairs that stand it as well, the nearest way wins.
const TRAVEL = 100;
// A country that is never well seen is judged by how little it faces the eye, which costs more than any distance.
const UNSEEN = 1e6;

/** Where a country stands for a spin and a lean: none off screen or at the limb; `well`, well seen; `shown`, readable at all. */
export type Probe = (
  lead: number,
  lean: number,
) => { at: Point; cosine: number; well: boolean; shown: boolean } | undefined;

/** The spin and the lean to turn to, none when no pair shows the country at all. */
export function bestPair(probe: Probe, from: { lead: number; lean: number }, aim: Point | undefined) {
  let best: { cost: number; lead: number; lean: number } | undefined;
  for (let spin = -LEADS; spin <= LEADS; spin += 1) {
    for (let step = -TILTS; step <= TILTS; step += 1) {
      const [lead, lean] = [from.lead + spin * AIM_STEP, (step * TILT) / TILTS];
      const seen = probe(lead, lean);
      if (seen === undefined || !(seen.well || seen.shown)) continue;
      const away = aim === undefined ? 0 : Math.hypot(seen.at.x - aim.x, seen.at.y - aim.y);
      const cost =
        (seen.well ? away : UNSEEN * (1 - seen.cosine)) +
        TRAVEL * (Math.abs(spin * AIM_STEP) + Math.abs(lean - from.lean));
      if (best === undefined || cost < best.cost) best = { cost, lead, lean };
    }
  }
  return best;
}
