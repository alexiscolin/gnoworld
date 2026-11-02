// The view at rest (slice 7d6; Alexis, 2026-11-02): the Earth at the canvas's centre, the great star beside it, two neighbour systems
// whole as postcards, one world of a nearby system close to the eye and cut by the frame's side, every other system a distant star. The
// eye is a pure function of the systems, so the same set gives the same view: the eyes that would stand each nearby world at a side are
// judged, then plain views, the nearest the plain one first, and the best composition wins.
import { EARTH_PLACE, GRAIN, type StarSystem } from "../cosmos/system.ts";
import type { Point } from "../space/cell.ts";
import { REST_DISTANCE } from "./disc.ts";
import { postcardWorlds } from "./postcard.ts";
import { postcardsOf, RICH, spotsOf, type Ask, type Card } from "./restCards.ts";
import { closeFits, closeViews } from "./restClose.ts";
import {
  away,
  cameraOf,
  DEGREE,
  DISTANCES,
  eyeAt,
  looksFrom,
  RANGE,
  type Candidate,
  type Close,
  type Held,
  type Look,
} from "./restLook.ts";

export { postcardOf } from "./postcard.ts";

export { FIELD_OF_VIEW, HERO_ZONE, REST_SCREENS, STAR_HEART } from "./restLook.ts";
export { REST_DISTANCE };

export interface RestView {
  /** Where the eye rests, on the map. */
  readonly eye: Point;
  /** The systems drawn whole, by their index. */
  readonly postcards: readonly number[];
  /** A world passing close to the eye, by its system's index and its own. */
  readonly close: { readonly system: number; readonly world: number } | undefined;
}

// Postcards and the close world come from the Earth's nearest systems.
const NEARBY = 24;
// A score: a close world first, then the postcards' bodies (three each at most), the depth the bodies show (capped), nearness to the plain
// view.
const CLOSE_SCORE = 1000;
const BODY_SCORE = 100;
const DEPTH_SCORE = 10;
const DEPTH_MOST = 6;
// The distance and the slant the views stray from: the Earth about 110 pixels across, and the disc's own tilt on the stage, in degrees.
const PLAIN_DISTANCE = 26;
const PLAIN_SLANT = 15;

const strayOf = ({ distance, slant, turn }: Candidate) =>
  2 * Math.abs(distance - PLAIN_DISTANCE) + Math.abs(slant / DEGREE - PLAIN_SLANT) + 0.1 * Math.abs(turn / DEGREE);

// The depth the bodies show: the farthest one's distance over the nearest's, the Earth among them, capped.
function depthOf(look: Look, postcards: readonly Card[], close: Close | undefined): number {
  const distances = [look.earth.away, ...spotsOf(look, postcards, { close }).map(({ away: far }) => far)];
  return Math.min(Math.max(...distances) / Math.min(...distances), DEPTH_MOST);
}

interface Judged {
  readonly score: number;
  readonly view: RestView;
}

/** A view's postcards and its score, if it holds: the great star beside the Earth, its close world, two neighbours whole. */
function judge(candidate: Candidate, ask: Ask): Judged | undefined {
  const { close } = ask;
  const camera = cameraOf(candidate);
  const looks = looksFrom(camera);
  const [video] = looks;
  if (video === undefined || !(ask.unlit === true || video.lit()) || !looks.every((look) => look.starBeside()))
    return undefined;
  if (close !== undefined && !closeFits(camera, close)) return undefined;
  const postcards = postcardsOf(looks, ask);
  if (postcards === undefined) return undefined;
  const bodies = postcards.reduce((sum, { worlds }) => sum + Math.min(worlds.length, RICH), 0);
  const score =
    (close === undefined ? 0 : CLOSE_SCORE) +
    BODY_SCORE * bodies +
    DEPTH_SCORE * depthOf(video, postcards, close) -
    strayOf(candidate);
  const where =
    close === undefined
      ? undefined
      : { system: close.held.index, world: close.held.system.worlds.indexOf(close.world) };
  return { score, view: { eye: camera.eye, postcards: postcards.map(({ held }) => held.index), close: where } };
}

// Views with no close world, the nearest the plain one first.
function plain(): Candidate[] {
  const [slantFrom, slantTo, slantStep] = RANGE.slant;
  const [turnFrom, turnTo, turnStep] = RANGE.turn;
  const slants = Array.from(
    { length: (slantTo - slantFrom) / slantStep + 1 },
    (_, at) => (slantFrom + at * slantStep) * DEGREE,
  );
  const turns = Array.from(
    { length: (turnTo - turnFrom) / turnStep + 1 },
    (_, at) => (turnFrom + at * turnStep) * DEGREE,
  );
  const all = DISTANCES.flatMap((distance) =>
    slants.flatMap((slant) => turns.map((turn) => ({ distance, slant, turn }))),
  );
  return all.sort((a, b) => strayOf(a) - strayOf(b));
}

// Every view a close world could give: a close world needs a third system beside the two postcards.
const closeOnes = (near: readonly Held[]) =>
  near.length > 2
    ? near.flatMap((held) =>
        held.bodies.flatMap((world) => closeViews(held, world).map((view) => ({ view, close: { held, world } }))),
      )
    : [];

// Where no view reads well, the nearest the plain one that fits: two postcards, else one; where no lit view stands any, the Earth unlit.
function lastResort(near: readonly Held[]): Judged | undefined {
  const asks = [false, true].flatMap((unlit) => [2, 1].map((most) => ({ near, lenient: true, most, unlit })));
  for (const ask of asks)
    for (const view of plain()) {
      const judged = judge(view, ask);
      if (judged !== undefined) return judged;
    }
  return undefined;
}

/** The view at rest over `systems`, as `systemsOf` gives them: the same systems, the same view. */
export function restView(systems: readonly StarSystem[]): RestView {
  // The Earth's nearest first, then each laid out: a file of 20,000 systems lays out 24.
  const near = systems
    .map((system, index) => ({ index, system, away: away(system.place, EARTH_PLACE) }))
    .filter(({ system }) => system.worlds.length > 0)
    .sort((a, b) => a.away - b.away)
    .slice(0, NEARBY)
    .map(({ index, system }) => {
      const bodies = system.worlds.filter(({ radius }) => radius >= GRAIN);
      const reach = Math.max(0, ...bodies.map(({ orbit, radius }) => orbit + radius));
      return { index, system, bodies, postcard: postcardWorlds(system), reach };
    });
  let chosen: Judged | undefined;
  // A view's score is at most its close world's, the bodies the two richest postcards draw and the depth's, less its stray: one that
  // cannot win is not judged.
  const [first = 0, second = 0] = near.map(({ postcard }) => Math.min(postcard.length, RICH)).sort((a, b) => b - a);
  const offer = (view: Candidate, close?: Close) => {
    const most =
      (close === undefined ? 0 : CLOSE_SCORE) +
      BODY_SCORE * (first + second) +
      DEPTH_SCORE * DEPTH_MOST -
      strayOf(view);
    const judged = chosen !== undefined && most <= chosen.score ? undefined : judge(view, { near, close });
    if (judged !== undefined && (chosen === undefined || judged.score > chosen.score)) chosen = judged;
  };
  for (const { view, close } of closeOnes(near)) offer(view, close);
  for (const view of plain()) offer(view);
  chosen ??= lastResort(near);
  return chosen?.view ?? { eye: eyeAt(PLAIN_DISTANCE, PLAIN_SLANT * DEGREE, 0), postcards: [], close: undefined };
}
