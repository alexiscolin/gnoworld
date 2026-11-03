// The home's rocks (part 7p; Alexis, 2026-11-03, "roches d'ambiance"): a few rocks in front of everything at the view at rest, decor as the
// field of stars is, not worlds: no name, no click, nothing that claims data. They stand in space from the view's own seed, so the same view
// sees the same rocks, the nearer larger, and slide with the eye as it moves; never over the Earth, a body or the room of its label. In the
// depth's chunk: it reads the view through the judge `deep.ts` makes of it.
import { nextState, textHash, unitOf, type Point } from "../space/cell.ts";
import { SWAY } from "../space/drift.ts";
import type { Judge } from "./deep.ts";
import type { RestView } from "./rest.ts";
import type { Look, Seen } from "./restLook.ts";

// A few, from this many tries: from 4 to 18 units ahead, the Earth 24 or more; their radius on the video's screen from 5 pixels far to 40
// near, a quarter of it by chance; 40 pixels apart at the least, so none clumps. A label's room round its body, as core's `settle.ts` stands
// it (PLACE): a pill 200 pixels wide at most and 32 high, its stem 12 in from the end over the body, 22 off its outline, above or below.
const MOST = 7;
const TRIES = 60;
const NEAREST = 4;
const DEEPEST = 14;
const SIZE = [5, 40] as const;
const MARGIN = 16;
const APART = 40;
const LABEL = { wide: 200, high: 32, stem: 12, gap: 22 } as const;

const gap = (a: Seen, b: Seen) => Math.hypot(a.x - b.x, a.y - b.y) - a.radius - b.radius;
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
  const { looks, swayed, balls, focal } = judge;
  const [first] = looks;
  if (first === undefined) return [];
  let state = textHash(`rocks ${view.eye.x.toFixed(4)} ${view.eye.y.toFixed(4)} ${view.eye.z.toFixed(4)}`);
  const next = () => {
    state = nextState(state);
    return unitOf(state);
  };
  const { camera, width, height } = first;
  const { eye, ahead, right, up } = camera;
  const rocks: Laid[] = [];
  const seen: Seen[] = [];
  for (let tried = 0; tried < TRIES && rocks.length < MOST; tried += 1) {
    const depth = NEAREST + DEEPEST * next();
    const pixels = SIZE[0] + (SIZE[1] - SIZE[0]) * (1 - (depth - NEAREST) / DEEPEST) ** 1.5 * (0.75 + 0.25 * next());
    const [x, y] = [width * (0.03 + 0.94 * next()), height * (0.12 + 0.85 * next())];
    const [across, upward] = [((x - width / 2) * depth) / focal, ((height / 2 - y) * depth) / focal];
    const place: Point = {
      x: eye.x + ahead.x * depth + right.x * across + up.x * upward,
      y: eye.y + ahead.y * depth + right.y * across + up.y * upward,
      z: eye.z + ahead.z * depth + right.z * across + up.z * upward,
    };
    const rock = { place, radius: (pixels * depth) / focal, shade: next(), turn: next() };
    const spot = first.seen(place, rock.radius);
    // At rest, whole and clear on both screens; swayed, clear of the Earth, the hero and the star, which each look sees again.
    const drift = (Math.hypot(SWAY.across, SWAY.up) * focal) / depth;
    const clear =
      looks.every(
        (look, at) =>
          look.whole(look.seen(place, rock.radius), 0) &&
          clearOn(look, look.seen(place, rock.radius), { rooms: balls[at] ?? [], drift }),
      ) &&
      judge.spots.every((body) => !onRoom(spot, body, MARGIN + drift)) &&
      swayed.every((look) => clearOn(look, look.seen(place, rock.radius), { rooms: [], drift: 0 }));
    if (!clear || seen.some((other) => gap(spot, other) < APART) || judge.evenRow([...seen, spot])) continue;
    rocks.push(rock);
    seen.push(spot);
  }
  return rocks;
}
