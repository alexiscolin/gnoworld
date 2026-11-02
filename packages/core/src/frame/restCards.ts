// The postcards of a view at rest (slice 7d6): the richest two of the Earth's nearest systems that stand whole, clear of what the view
// keeps, apart from each other and from the Earth, each with its bodies spread round its star as the eye sees it.
import type { Orbiter, StarSystem } from "../cosmos/system.ts";
import { composed } from "./composition.ts";
import { postcardFrom } from "./postcard.ts";
import { clearOfClose } from "./restClose.ts";
import { placeOf, type Close, type Held, type Look, type Seen } from "./restLook.ts";

// A postcard reads as a small system round its star from three bodies; pixels of room round its ball, which the sway leaves.
export const RICH = 3;
const MARGIN = 24;

/** A system as a postcard from one eye: its plane as drawn, its bodies spread round its star, and the ball they and its specks turn in. */
export interface Card {
  readonly held: Held;
  readonly system: StarSystem;
  readonly worlds: readonly Orbiter[];
  readonly reach: number;
}

/** What a view is judged for: the Earth's nearest systems, its close world if any, and, in the last resort, that only fitting counts, how
 * many postcards it takes, and whether the Earth may stand unlit. */
export interface Ask {
  readonly near: readonly Held[];
  readonly close?: Close | undefined;
  readonly lenient?: boolean;
  readonly most?: number;
  readonly unlit?: boolean;
}

const cardOf = (held: Held, looks: readonly Look[]): Card => {
  const [look] = looks;
  const { system, worlds } =
    look === undefined
      ? { system: held.system, worlds: [] }
      : postcardFrom(held.system, held.postcard, look.camera.eye);
  return { held, system, worlds, reach: Math.max(held.reach, ...worlds.map(({ orbit, radius }) => orbit + radius)) };
};

const apart = (a: Seen, b: Seen) => Math.hypot(a.x - b.x, a.y - b.y) >= a.radius + b.radius + MARGIN;

// A postcard: a body or more round its star; its ball, at every phase, whole and covering nothing, clear of the Earth whatever their
// depths; the margin holds it through the sway. No world of it hides behind the close world.
function fits(looks: readonly Look[], { held, reach, worlds }: Card, close: Close | undefined): boolean {
  const [first] = looks;
  if (worlds.length === 0) return false;
  const place = held.system.place;
  const whole = looks.every((look) => {
    const ball = look.ball(place, reach);
    return look.whole(ball, MARGIN) && look.clear(ball, MARGIN) && apart(ball, look.earth);
  });
  return whole && (close === undefined || first === undefined || clearOfClose(first.camera, close, { place, reach }));
}

/** The bodies drawn at rest that show on `look`'s screen. */
export function spotsOf(look: Look, cards: readonly Card[], close: Close | undefined): Seen[] {
  const drawn = cards.flatMap(({ system, worlds }) =>
    worlds.map((world) => look.seen(placeOf(system, world, 0), world.radius)),
  );
  if (close !== undefined) drawn.push(look.seen(placeOf(close.held.system, close.world, 0), close.world.radius));
  return drawn.filter((at) => !look.off(at));
}

// The richer of two postcards, three bodies or more counting alike, then the nearer, as the Earth's nearest are held.
const richer = (a: Card, b: Card) => Math.min(b.worlds.length, RICH) - Math.min(a.worlds.length, RICH);

/** The postcards: the richest two of the Earth's nearest that fit, stand apart and read well with the close world, or as many as there
 * are. The last resort, where none reads well, takes the richest that fit. */
export function postcardsOf(
  looks: readonly Look[],
  { near, close, lenient = false, most = 2 }: Ask,
): Card[] | undefined {
  const fit = near
    .filter((held) => held !== close?.held)
    .map((held) => cardOf(held, looks))
    .filter((card) => fits(looks, card, close))
    .sort(richer);
  const wanted = Math.min(most, near.length - (close === undefined ? 0 : 1));
  const reads = (pair: readonly Card[]) =>
    lenient ||
    looks.every((look) => {
      const [one, other] = pair.map(({ held, reach }) => look.ball(held.system.place, reach));
      const spread = one === undefined || other === undefined || apart(one, other);
      return spread && composed(spotsOf(look, pair, close), look.earth, close !== undefined);
    });
  const pairs = fit.flatMap((first, at) => fit.slice(at + 1).map((second) => [first, second]));
  if (wanted === 2) return pairs.find(reads);
  return fit.length >= wanted && reads(fit.slice(0, wanted)) ? fit.slice(0, wanted) : undefined;
}
