import type { Raw } from "./smoothness.ts";

// The samples of smoothness.ts read in Node: a series' jumps and bounces, the frames' stalls, the shifts and the long frames.

interface Odd {
  at: number;
  t: number;
  value: number;
  typical: number;
}
export interface Series {
  jumps: Odd[];
  bounces: Odd[];
}
export interface Report {
  frames: number;
  seconds: number;
  median: number;
  worst: number;
  stalls: { count: number; worstMs: number };
  long: { count: number; worstMs: number };
  cls: { sum: number; nodes: string[] };
  /** The camera's speed and turn per second, each frame against its neighbours; the eye's reversals while a flight flies. */
  eye: Series | null;
  look: Series | null;
  lead: Series | null;
  /** The facing's latitude and longitude (unwrapped), and the total longitude travelled in turns: over one is a whole turn. */
  lat: Series | null;
  lon: Series | null;
  turns: number;
  /** Frames showing a skeleton over 0.02, and the share of the last second's frames that do. */
  skeleton: { frames: number; lastSecond: number };
  /** Times the Earth stopped standing as itself, with the time of each. */
  earthDrops: number[];
  watched: Record<string, { opacity: Series; scale: Series; left: Series; width: Series }>;
}

const median = (list: number[]): number => {
  const sorted = [...list].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};
const norm = (v: readonly number[]): number => Math.hypot(...v);
const minus = (a: readonly number[], b: readonly number[]): number[] => a.map((x, i) => x - (b[i] ?? 0));

/**
 * A series' continuity, from its value at each frame time. A jump: the step between two frames is over `factor` times the median step of
 * its eight neighbours and over `floor` (so the noise of a still value is not one). A bounce: the velocity changes sign, each side over
 * `floor`, where an eased motion only slows. Steps are taken per second, so a slow frame is not a jump of its own.
 */
export function continuity(
  times: readonly number[],
  values: readonly number[],
  { factor = 4, floor }: { factor?: number; floor: number },
): Series {
  const rates = values.slice(1).map((v, i) => {
    const dt = Math.max(((times[i + 1] ?? 0) - (times[i] ?? 0)) / 1000, 1e-3);
    return (v - (values[i] ?? 0)) / dt;
  });
  const jumps: Odd[] = [];
  const bounces: Odd[] = [];
  rates.forEach((rate, i) => {
    if (!Number.isFinite(rate)) return;
    const around = median(
      rates
        .slice(Math.max(0, i - 4), i + 5)
        .filter((_, k) => k !== Math.min(i, 4))
        .map(Math.abs),
    );
    const at = i + 1;
    const t = times[at] ?? 0;
    const dt = (t - (times[i] ?? 0)) / 1000;
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

// The eye's way: its speed per frame is a series (a jump is a step in the speed's own steps), and its reversals (a step against the one before)
// are the bounces, counted only where both steps are over `floor`.
function wayOf(times: readonly number[], points: readonly (readonly number[])[], floor: number): Series {
  const steps = points.slice(1).map((p, i) => minus(p, points[i] ?? p));
  const speed = steps.map((s, i) => norm(s) / Math.max(((times[i + 1] ?? 0) - (times[i] ?? 0)) / 1000, 1e-3));
  const jumps = continuity(times.slice(1), speed, { floor: floor * 1000 }).jumps;
  const bounces: Odd[] = [];
  steps.forEach((s, i) => {
    const before = steps[i - 1];
    if (before === undefined) return;
    const dot = s.reduce((sum, x, k) => sum + x * (before[k] ?? 0), 0);
    if (dot < 0 && norm(s) > floor && norm(before) > floor)
      bounces.push({ at: i + 1, t: times[i + 1] ?? 0, value: norm(s), typical: norm(before) });
  });
  return { jumps, bounces };
}

const pose = (raw: Raw, key: "eye" | "look", floor: number): Series | null => {
  const kept = raw.frames.filter((frame) => frame[key] !== undefined);
  return kept.length > 3
    ? wayOf(
        kept.map(({ t }) => t),
        kept.map((frame) => [...(frame[key] ?? [])]),
        floor,
      )
    : null;
};

// What faces the eye on the Earth: latitude and longitude as series (the longitude unwrapped), and the longitude's whole turns.
function facingOf(raw: Raw): Pick<Report, "lat" | "lon" | "turns" | "lead"> {
  const facing = raw.frames.flatMap(({ t, lat, lon }) =>
    lat === undefined || lon === undefined || !Number.isFinite(lat + lon) ? [] : [{ t, lat, lon }],
  );
  const unwrapped: number[] = [];
  for (const { lon } of facing) {
    const last = unwrapped.at(-1);
    unwrapped.push(last === undefined ? lon : last + Math.atan2(Math.sin(lon - last), Math.cos(lon - last)));
  }
  const times = facing.map(({ t }) => t);
  const leads = raw.frames.flatMap(({ t, lead }) => (lead === undefined ? [] : [{ t, lead }]));
  const some = facing.length > 3;
  return {
    lat: some
      ? continuity(
          times,
          facing.map(({ lat }) => lat),
          { floor: 0.01 },
        )
      : null,
    lon: some ? continuity(times, unwrapped, { floor: 0.02 }) : null,
    turns: Math.abs((unwrapped.at(-1) ?? 0) - (unwrapped[0] ?? 0)) / (2 * Math.PI),
    lead:
      leads.length > 3
        ? continuity(
            leads.map(({ t }) => t),
            leads.map(({ lead }) => lead),
            { floor: 0.02 },
          )
        : null,
  };
}

function watchedOf(raw: Raw): Report["watched"] {
  const watched: Report["watched"] = {};
  for (const selector of new Set(raw.frames.flatMap(({ watched: seen }) => Object.keys(seen)))) {
    const own = raw.frames.flatMap(({ t, watched: seen }) => {
      const one = seen[selector];
      return one == null ? [] : [{ t, ...one }];
    });
    const times = own.map(({ t }) => t);
    const of = (read: (frame: (typeof own)[number]) => number, floor: number) =>
      continuity(times, own.map(read), { floor });
    watched[selector] = {
      opacity: of(({ opacity }) => opacity, 0.05),
      scale: of(({ scale }) => scale, 0.03),
      left: of(({ left }) => left, 1.5),
      width: of(({ width }) => width, 1.5),
    };
  }
  return watched;
}

const skeletonOf = (raw: Raw): Report["skeleton"] => {
  const end = raw.frames.at(-1)?.t ?? 0;
  const last = raw.frames.filter(({ t }) => t > end - 1000);
  const shown = ({ skeleton = 0 }: { skeleton?: number }) => skeleton > 0.02;
  return { frames: raw.frames.filter(shown).length, lastSecond: last.filter(shown).length / Math.max(1, last.length) };
};

export function analyse(raw: Raw, { eyeFloor = 0.02, lookFloor = 0.003 } = {}): Report {
  const times = raw.frames.map(({ t }) => t);
  const gaps = times.slice(1).map((t, i) => t - (times[i] ?? t));
  const mid = median(gaps);
  const stalled = gaps.filter((gap) => gap > 2 * mid);
  return {
    frames: raw.frames.length,
    seconds: ((times.at(-1) ?? 0) - (times[0] ?? 0)) / 1000,
    median: mid,
    worst: Math.max(0, ...gaps),
    stalls: { count: stalled.length, worstMs: Math.max(0, ...stalled) },
    long: { count: raw.long.length, worstMs: Math.max(0, ...raw.long.map(({ duration }) => duration)) },
    cls: {
      sum: raw.shifts.reduce((sum, { value }) => sum + value, 0),
      nodes: [...new Set(raw.shifts.flatMap(({ nodes }) => nodes))],
    },
    eye: pose(raw, "eye", eyeFloor),
    look: pose(raw, "look", lookFloor),
    ...facingOf(raw),
    skeleton: skeletonOf(raw),
    earthDrops: raw.frames.flatMap(({ t, earthShown }, i) =>
      earthShown === false && raw.frames[i - 1]?.earthShown === true ? [t] : [],
    ),
    watched: watchedOf(raw),
  };
}

export const odd = ({ eye, look, lead, lat, lon, watched, earthDrops }: Report): number =>
  earthDrops.length +
  [
    eye,
    look,
    lead,
    lat,
    lon,
    ...Object.values(watched).flatMap(({ opacity, scale, left, width }) => [opacity, scale, left, width]),
  ].reduce((sum, series) => sum + (series?.jumps.length ?? 0) + (series?.bounces.length ?? 0), 0);
