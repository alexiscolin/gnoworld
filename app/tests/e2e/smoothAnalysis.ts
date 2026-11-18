import { continuity, median, merged, type Odd, type Series } from "./smoothContinuity.ts";
import type { Raw } from "./smoothness.ts";

export { continuity };

// The samples of smoothness.ts read in Node: a series' jumps and bounces, the frames' stalls, the shifts and the long frames.

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

const norm = (v: readonly number[]): number => Math.hypot(...v);
const minus = (a: readonly number[], b: readonly number[]): number[] => a.map((x, i) => x - (b[i] ?? 0));

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
  // A cover cuts the way in two: what moved under it was not seen, and the frames on either side are not one step.
  const runs = raw.frames.reduce<Raw["frames"][]>(
    (all, frame) =>
      frame[key] === undefined || frame.covered === true ? [...all, []] : (all.at(-1)?.push(frame), all),
    [[]],
  );
  const ways = runs
    .filter((run) => run.length > 3)
    .map((run) =>
      wayOf(
        run.map(({ t }) => t),
        run.map((frame) => [...(frame[key] ?? [])]),
        floor,
      ),
    );
  return ways.length > 0 ? merged(ways) : null;
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

// The page's parts, read where they are drawn: where the scene runs, a stall of its software GPU (a frame over twice the median) draws none
// of a transition that runs in it, which the same flow with no scene draws whole (4b: the views' bar's 120 px in 350 ms, 60 frames a
// second); with no scene, every step is judged.
function watchedOf(raw: Raw, unseen: number): Report["watched"] {
  const watched: Report["watched"] = {};
  for (const selector of new Set(raw.frames.flatMap(({ watched: seen }) => Object.keys(seen)))) {
    const own = raw.frames.flatMap(({ t, watched: seen }) => {
      const one = seen[selector];
      return one == null ? [] : [{ t, ...one }];
    });
    // A new element starts a run of its own only where the one before was no longer seen: a swap in sight is judged.
    const runs = own.reduce<(typeof own)[]>((all, frame) => {
      const [last, before] = [all.at(-1), all.at(-1)?.at(-1)];
      if (last !== undefined && (before?.id === frame.id || (before?.seen ?? 0) >= 0.05)) last.push(frame);
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
      return merged(each);
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
    watched: watchedOf(raw, raw.frames.some(({ eye }) => eye !== undefined) ? 2 * mid : Infinity),
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
