// The whole cosmos (ADR-0002 §10; Alexis, 2026-11-02): past a cluster's distance the worlds themselves are the nebula, a soft point for each
// real world and a thin line for each real import between two worlds. A line means a link the file holds and nothing else; a point's size
// and light come from its distance, so none keeps a size as the eye leaves. Plain numbers, written by a look, left alone by a frame.
import { textHash, type Point } from "../space/cell.ts";
import { moodAt, newMood } from "../space/mood.ts";
import { lerp } from "../space/smooth.ts";

/** The most lines drawn, one draw whatever the file: more than twice the worlds a file may hold. */
export const LINKS_MOST = 40_960;

/** A world of the file, as its links read it: its realms' paths and what each imports. */
export interface LinkedWorld {
  readonly id: string;
  readonly realms: readonly { readonly path?: string; readonly imports?: readonly string[] }[];
}

/** A soft point: its radius on screen in pixels, and how much of its light shows at its heart, 0 to 1. */
export interface Soft {
  size: number;
  light: number;
}

const REALM = "gno.land/r/";
// A world's soft point reaches this many times its body's radius; under the least size it dims instead of shrinking.
const GLOW = 3.2;
const LEAST = 0.75;
// The lens's opening, in world units: how fast a point nearer than the focus spreads.
const APERTURE = 40;
// Rose and peach (the post Alexis gave, 2026-11-02), in linear light: how much of it a world's point takes over the mood's colour, and how
// much of its own grey it keeps, so the mood's amber reads as the stills' rose-peach, never saturated.
const PEACH = { red: 0.8, green: 0.3, blue: 0.28 };
const PEACH_SHARE = 0.5;
const GREY = 0.15;
// A dark mood is lifted to its full light no further than from this: where its hue turns, it turns as smoothly as the mood.
const DARKEST = 0.25;

// Which world holds each realm the file names: of two that name one, the first by id, in any order.
function holders(worlds: readonly LinkedWorld[]): Map<string, number> {
  const held = new Map<string, number>();
  worlds.forEach(({ id, realms }, at) => {
    for (const { path } of realms) {
      const before = path === undefined ? undefined : held.get(path);
      if (path !== undefined && (before === undefined || id < (worlds[before]?.id ?? ""))) held.set(path, at);
    }
  });
  return held;
}

// The worlds a world's realms import, by index: realms only, each one the file holds.
const importsOf = (realms: LinkedWorld["realms"], held: ReadonlyMap<string, number>): number[] =>
  realms.flatMap(({ imports = [] }) =>
    imports.flatMap((path) => {
      const to = path.startsWith(REALM) ? held.get(path) : undefined;
      return to === undefined ? [] : [to];
    }),
  );

/** The links of a set, as pairs of indices into it: a pair once for each two worlds a realm of one imports a realm of the other, at most
 * `most`. Past the bound the pairs kept go by a hash of their two names, so the same set keeps the same lines in any order, spread over it. */
export function linksOf(worlds: readonly LinkedWorld[], most = LINKS_MOST): number[] {
  const held = holders(worlds);
  const pairs = new Map<string, readonly [number, number]>();
  // ponytail: one pass over every import the file names, which its 4 MiB cap holds to a few hundred thousand.
  worlds.forEach(({ id, realms }, from) => {
    for (const to of importsOf(realms, held)) {
      const other = to === from ? undefined : worlds[to]?.id;
      if (other !== undefined) pairs.set(id < other ? `${id} ${other}` : `${other} ${id}`, [from, to]);
    }
  });
  const kept = [...pairs.keys()]
    .map((key) => ({ key, hash: textHash(key) }))
    .sort((a, b) => a.hash - b.hash || (a.key < b.key ? -1 : 1))
    .slice(0, most);
  return kept.flatMap(({ key }) => pairs.get(key) ?? []);
}

/** A world's soft point, `distance` from the eye, the eye looking `focus` away through a lens of `focal` pixels, into `out`: its light over
 * its round falls as the square of the distance; nearer than the focus it spreads, larger and softer, the same light over a wider round. */
export function softPoint(
  radius: number,
  { distance, focus, focal }: { readonly distance: number; readonly focus: number; readonly focal: number },
  out: Soft,
): void {
  // The eye inside a world's glow sees it as filling the view, never as infinite; nothing in focus spreads nothing.
  const sharp = (radius * GLOW * focal) / Math.max(distance, radius * GLOW);
  const core = Math.max(sharp, LEAST);
  const blur = focus > 0 ? APERTURE * focal * Math.max(0, 1 / Math.max(distance, radius * GLOW) - 1 / focus) : 0;
  out.size = Math.hypot(core, blur);
  out.light = (sharp / out.size) ** 2;
}

/** A world's colour at its place on the stage, in linear light: the mood of space where it stands, warmed towards rose and peach. */
export function pointTint(at: Point, out: { red: number; green: number; blue: number }): void {
  const mood = newMood();
  moodAt(mood, at);
  const brightest = Math.max(mood.red, mood.green, mood.blue, DARKEST);
  out.red = lerp(mood.red / brightest, PEACH.red, PEACH_SHARE);
  out.green = lerp(mood.green / brightest, PEACH.green, PEACH_SHARE);
  out.blue = lerp(mood.blue / brightest, PEACH.blue, PEACH_SHARE);
  const grey = 0.2126 * out.red + 0.7152 * out.green + 0.0722 * out.blue;
  out.red = lerp(out.red, grey, GREY);
  out.green = lerp(out.green, grey, GREY);
  out.blue = lerp(out.blue, grey, GREY);
}
