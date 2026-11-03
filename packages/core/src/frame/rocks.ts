// The home's rocks (part 7p; Alexis, 2026-11-03, "roches d'ambiance"): a few rocks in front of everything at the view at rest, decor as the
// field of stars is, not worlds: no name, no click, nothing that claims data. They stand in space from the view's own seed, so the same view
// sees the same rocks, the nearer larger, and slide with the eye as it moves; never over the Earth, a body or the room of its label. In the
// depth's chunk: it reads the view through the judge `deep.ts` makes of it.
import { nextState, textHash, unitOf, type Point } from "../space/cell.ts";
import { SWAY } from "../space/drift.ts";
import { gap, type Judge } from "./deep.ts";
import type { RestView } from "./rest.ts";
import type { Look, Seen } from "./restLook.ts";

// One near, 4 to 6 units ahead, 30 to 60 pixels in radius on the video's screen, its centre 0.2 to 0.95 of that inside the frame's left or
// bottom edge, so the frame cuts some of it, the ticker's band no more (the design review of 7p, after the references). Then pebbles, a
// cluster round one place 8 to 16 units ahead (frame 4's debris): 3 to 12 pixels there, the nearer larger, within 100 of it.
const MOST = 7;
const TRIES = 60;
const MARGIN = 16;
const APART = 6;
// A label's room round its body, as core's `settle.ts` stands it (PLACE): a pill 200 pixels wide at most and 32 high, its stem 12 in from
// the end over the body, 22 off its outline, above or below.
const LABEL = { wide: 200, high: 32, stem: 12, gap: 22 } as const;

// Whether a rock there stands on a body, or where its label may stand, `margin` pixels round.
const onRoom = (rock: Seen, body: Seen, margin = MARGIN) =>
  gap(rock, body) < margin ||
  (Math.abs(rock.x - body.x) < LABEL.wide - LABEL.stem + rock.radius + margin &&
    Math.abs(rock.y - body.y) < body.radius + LABEL.gap + LABEL.high + rock.radius + margin);

// A rock seen on one screen: off the hero, the star's heart, the Earth and its label's room, and every one of `rooms` and its label's room,
// the rock sliding `drift` pixels past them as the eye sways.
const clearOn = (look: Look, rock: Seen, { rooms, drift }: { rooms: readonly Seen[]; drift: number }) =>
  look.clear(rock, MARGIN) && !onRoom(rock, look.earth) && rooms.every((body) => !onRoom(rock, body, MARGIN + drift));

/** A rock on the map: its place, its radius, its shade and its turn, both from 0 to 1. */
export interface Laid {
  readonly place: Point;
  readonly radius: number;
  readonly shade: number;
  readonly turn: number;
}

/** The rocks of the home's view at rest `view`, read through its `judge` once its depth stands, from the view's own seed, on the map. */
export function rocksOf(view: RestView, judge: Judge): Laid[] {
  const { looks, swayed, balls, focal, spots } = judge;
  const [first] = looks;
  if (first === undefined) return [];
  let state = textHash(`rocks ${view.eye.x.toFixed(4)} ${view.eye.y.toFixed(4)} ${view.eye.z.toFixed(4)}`);
  const next = () => {
    state = nextState(state);
    return unitOf(state);
  };
  const { camera, width, height } = first;
  const { eye, ahead, right, up } = camera;
  const [rocks, seen]: [Laid[], Seen[]] = [[], []];
  // A rock at `x`, `y` on the video's screen, `depth` units ahead and `pixels` in radius there, laid if it stands clear: on both screens at
  // rest, whole unless `cut`, and swayed, clear of the Earth, the hero and the star; apart from the rocks laid, in no row with them.
  const tryAt = ([x, y, depth, pixels]: readonly [number, number, number, number], cut = false) => {
    const [across, upward] = [((x - width / 2) * depth) / focal, ((height / 2 - y) * depth) / focal];
    const place: Point = {
      x: eye.x + ahead.x * depth + right.x * across + up.x * upward,
      y: eye.y + ahead.y * depth + right.y * across + up.y * upward,
      z: eye.z + ahead.z * depth + right.z * across + up.z * upward,
    };
    const rock = { place, radius: (pixels * depth) / focal, shade: next(), turn: next() };
    const spot = first.seen(place, rock.radius);
    const drift = (Math.hypot(SWAY.across, SWAY.up) * focal) / depth;
    const clear =
      looks.every((look, at) => {
        const there = look.seen(place, rock.radius);
        return (cut || look.whole(there, 0)) && clearOn(look, there, { rooms: balls[at] ?? [], drift });
      }) &&
      spots.every((body) => !onRoom(spot, body, MARGIN + drift)) &&
      swayed.every((look) => clearOn(look, look.seen(place, rock.radius), { rooms: [], drift: 0 }));
    if (!clear || seen.some((other) => gap(spot, other) < APART) || judge.lent.evenRow([...seen, spot])) return false;
    rocks.push(rock);
    seen.push(spot);
    return true;
  };
  // The near one, its centre inside the frame's left edge or its bottom edge by 0.2 to 0.95 of its radius.
  for (let tried = 0; tried < 3 * TRIES; tried += 1) {
    const size = [4 + 2 * next(), 30 + 30 * next()] as const;
    const [off, along] = [size[1] * (0.2 + 0.75 * next()), next()];
    const [x, y] = next() < 0.5 ? [off, height * (0.12 + 0.85 * along)] : [width * (0.03 + 0.85 * along), height - off];
    if (tryAt([x, y, ...size], true)) break;
  }
  // The pebbles round one place: the first of a few that holds three, or what the last holds.
  const from = rocks.length;
  for (let place = 0; place < 4 && rocks.length - from < 3; place += 1) {
    [rocks.length, seen.length] = [from, from];
    const [x, y, depth] = [width * (0.1 + 0.8 * next()), height * (0.15 + 0.7 * next()), 8 + 8 * next()];
    for (let tried = 0; tried < TRIES && rocks.length < MOST; tried += 1) {
      const [reach, angle, nearer] = [100 * Math.sqrt(next()), 2 * Math.PI * next(), 0.85 + 0.3 * next()];
      const pixels = (3 + 9 * next() ** 2) / nearer;
      tryAt([x + reach * Math.cos(angle), y + reach * Math.sin(angle), depth * nearer, pixels]);
    }
  }
  return rocks;
}
