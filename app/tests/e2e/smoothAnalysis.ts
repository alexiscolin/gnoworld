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

// The camera under the opaque full chat (`covered`) is not seen: those frames are left out.
const pose = (raw: Raw, key: "eye" | "look", floor: number): Series | null => {
  const kept = raw.frames.filter((frame) => frame[key] !== undefined && frame.covered !== true);
  return kept.length > 3
    ? wayOf(
        kept.map(({ t }) => t),
        kept.map((frame) => [...(frame[key] ?? [])]),
        floor,
      )
    : null;
};

// What faces the eye on the Earth, in radians (ground.ts gives degrees): latitude, the longitude unwrapped and its whole turns; only where the
// Earth stands as itself, as its stand-in draws no ground and light.ts's turn is set as the Earth is first drawn.
const RADIAN = Math.PI / 180;
function facingOf(raw: Raw): Pick<Report, "lat" | "lon" | "turns" | "lead"> {
  const facing = raw.frames.flatMap(({ t, lat, lon, earthShown, covered }) =>
    lat === undefined || lon === undefined || earthShown === false || covered === true || !Number.isFinite(lat + lon)
      ? []
      : [{ t, lat: lat * RADIAN, lon: lon * RADIAN }],
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

// The page's parts, one element at a time (a page drawn anew matches another), read where they are drawn: a stall of the scene's
// software GPU (a frame over twice the median) draws none of a transition that runs in it, which the same flow with no scene draws
// whole (the views' bar's 120 px in 350 ms, 60 frames a second).
function watchedOf(raw: Raw, unseen: number): Report["watched"] {
  const watched: Report["watched"] = {};
  for (const selector of new Set(raw.frames.flatMap(({ watched: seen }) => Object.keys(seen)))) {
    const own = raw.frames.flatMap(({ t, watched: seen }) => {
      const one = seen[selector];
      return one == null ? [] : [{ t, ...one }];
    });
    const runs = own.reduce<(typeof own)[]>((all, frame) => {
      const last = all.at(-1);
      if (last?.at(-1)?.id === frame.id) last.push(frame);
      else all.push([frame]);
      return all;
    }, []);
    const of = (read: (frame: (typeof own)[number]) => number, floor: number): Series => {
      const each = runs.map((run) =>
        continuity(
          run.map(({ t }) => t),
          run.map(read),
          { floor, unseen },
        ),
      );
      return { jumps: each.flatMap(({ jumps }) => jumps), bounces: each.flatMap(({ bounces }) => bounces) };
    };
    watched[selector] = {
      // What the reader sees, its parents' opacity in: an element at 1 under a hidden parent is not shown.
      opacity: of(({ seen }) => seen, 0.05),
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
    watched: watchedOf(raw, 2 * mid),
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
