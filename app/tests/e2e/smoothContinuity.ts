// A series' continuity, shared by the smoothness measure's readings (smoothAnalysis.ts): its jumps and bounces, frame by frame.

export interface Odd {
  at: number;
  t: number;
  value: number;
  typical: number;
}

export interface Series {
  jumps: Odd[];
  bounces: Odd[];
}

export const median = (list: number[]): number => {
  const sorted = [...list].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

export const merged = (each: readonly Series[]): Series => ({
  jumps: each.flatMap(({ jumps }) => jumps),
  bounces: each.flatMap(({ bounces }) => bounces),
});

/**
 * A series' continuity, by frame time. A jump: a step over `factor` times its eight neighbours' median and over `floor`; a bounce: the velocity
 * turns, each side over `floor`. Steps are per second (a slow frame is no jump), and one over `unseen` ms is not judged: it was never drawn.
 */
export function continuity(
  times: readonly number[],
  values: readonly number[],
  { factor = 4, floor, unseen = Infinity }: { factor?: number; floor: number; unseen?: number },
): Series {
  const rates = values.slice(1).map((v, i) => {
    const dt = Math.max(((times[i + 1] ?? 0) - (times[i] ?? 0)) / 1000, 1e-3);
    return (v - (values[i] ?? 0)) / dt;
  });
  const jumps: Odd[] = [];
  const bounces: Odd[] = [];
  rates.forEach((rate, i) => {
    const at = i + 1;
    const t = times[at] ?? 0;
    const dt = (t - (times[i] ?? 0)) / 1000;
    if (!Number.isFinite(rate) || dt * 1000 > unseen) return;
    const around = median(
      rates
        .slice(Math.max(0, i - 4), i + 5)
        .filter((_, k) => k !== Math.min(i, 4))
        .map(Math.abs),
    );
    if (Math.abs(rate) * dt > floor && Math.abs(rate) > factor * Math.max(around, floor / Math.max(dt, 1e-3) / 20))
      jumps.push({ at, t, value: Math.abs(rate) * dt, typical: around * dt });
    const before = rates[i - 1];
    if (before !== undefined && Math.sign(before) * Math.sign(rate) < 0) {
      const small = Math.min(Math.abs(before) * dt, Math.abs(rate) * dt);
      if (small > floor) bounces.push({ at, t, value: rate * dt, typical: before * dt });
    }
  });
  return { jumps, bounces };
}
