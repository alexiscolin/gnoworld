// The engine's one loop (D401): each frame the rig moves the camera, the page's hold and the level follow it, the stage's planets,
// names, orbits, lights and effects follow the camera, and the frame is drawn, blurred while fast. It draws while the page is seen, space
// is not covered and its context holds, makes nothing on a frame, and ends with the engine.
import { pixelRatioFor } from "@gnoworld/core";
import type { Space } from "./scene.ts";
import { placeOf, type Planet, type System, type Vec } from "./layout.ts";
import { ORBIT_GAIN } from "./parts/marks.ts";
import { HOME_SYSTEM } from "../cosmosAt.ts";
import { aloneOf, homeFrame } from "./framing.ts";
import { followHome } from "./follow.ts";
import { WANDER } from "./rig/free.ts";
import { eyeOf } from "./rig/pose.ts";

const LONGEST_STEP_MS = 50;
const CHOOSE_MS = 100;
// On a page the universe dims as the demo's behind a plate: the suns to 0.45, the dust to 0.15, the stars to half.
const PAGE = { sun: 0.45, dust: 0.15, stars: 0.5 } as const;
const EASE_S = 0.6;
const PLATE_S = 0.16;
// raw: a lens dims what it does not light over about half a second, the design system's slow motion
const LENS_S = 0.18;
const ORBITS_S = 0.3;
// Where the page's planet stands this frame, for the scan.
const PLANET_AT: Vec = { x: 0, y: 0, z: 0 };
// The level follows the zoom: out of a system past 11 of its reaches, the universe; the eye among a system's orbits, that system.
const LEAVE = 11;
const ENTER = 1.2;
// raw: how many orbits a system draws at their full strength
const CLEAR_ORBITS = 12;

/** Runs `space`'s loop till it is disposed. */
export function draw(space: Space): void {
  let [last, chose, drawn] = [performance.now(), 0, false];
  // What the near planets are chosen by, written each time: a frame makes nothing.
  const choosing = { pxK: 0, seconds: 0 };
  const step = (now: number) => {
    if (space.disposed) return;
    requestAnimationFrame(step);
    if (!space.seen || document.hidden || space.renderer.getContext().isContextLost()) {
      last = now;
      return;
    }
    // A frame's stamp may come before the clock read as the loop began: never a step back, which would start a flight's slide below 0.
    const delta = Math.min(Math.max(now - last, 0), LONGEST_STEP_MS);
    last = now;
    resize(space);
    advance(space, delta);
    if (now - chose > CHOOSE_MS && space.universe !== undefined) {
      chose = now;
      choosing.pxK = space.see.pxK;
      choosing.seconds = space.seconds;
      space.stage.near?.choose(space.universe, space.camera.position, choosing);
    }
    paint(space, delta);
    if (!drawn && space.universe !== undefined) {
      drawn = true;
      space.options.events.drawn();
    }
  };
  requestAnimationFrame(step);
}

// The pixels drawn per page pixel: the screen's, two at most, one on a touch screen or where the settings ask for low quality.
const touch = matchMedia("(pointer: coarse)");
const ratioOf = (): number =>
  pixelRatioFor(
    devicePixelRatio,
    touch.matches,
    document.documentElement.dataset["quality"] === "low" ? "low" : "high",
  );

function resize(space: Space): void {
  const { canvas } = space.options;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const ratio = ratioOf();
  if (
    width === space.see.screen.width &&
    height === space.see.screen.height &&
    ratio === space.renderer.getPixelRatio()
  )
    return;
  space.renderer.setPixelRatio(ratio);
  space.see.screen.width = width;
  space.see.screen.height = height;
  space.renderer.setSize(width, height, false);
  space.camera.aspect = width / Math.max(height, 1);
}

// The slow turn at rest: none on a page, on the home's Earth (D459: it would turn its light away) or under reduced motion; far
// out the galaxy's own (not the Map's); else the one near a system.
function wanderOf(space: Space, still: boolean): (typeof WANDER)[keyof typeof WANDER] {
  if (still || space.place?.kind === "world" || space.arrival) return WANDER.none;
  return space.place?.kind === "universe" && !space.plan ? WANDER.galaxy : WANDER.near;
}

function advance(space: Space, delta: number): void {
  const { rig, stage } = space;
  const still = space.options.still();
  space.seconds += delta / 1000;
  rig.advance(delta, still);
  followHome(space, delta);
  const paged = space.place?.kind === "world";
  // At rest on a page, the camera keeps to its planet as it goes round its sun, the eye moved with it in the same frame: a frame behind,
  // it lagged the planet by a step that changes with the frame's time, which shakes a planet framed close.
  const planet = space.kept;
  if (planet !== undefined && !rig.flying) {
    placeOf(planet, space.seconds, rig.pose.look);
    eyeOf(rig.pose, rig.eye);
  }
  if (!rig.flying) {
    rig.page = paged;
    rig.free.wander = wanderOf(space, still);
    rig.free.level = space.plan && space.place?.kind !== "universe";
    rig.free.pointed = space.place?.kind === "universe";
    settle(space);
  }
  rig.aim(space.camera, space.see.screen);
  const { frame } = stage;
  frame.uTime.value = space.seconds;
  frame.uPxK.value = space.see.pxK;
  frame.uProj.value =
    (space.see.screen.height * space.renderer.getPixelRatio()) / (2 * Math.tan((space.camera.fov * Math.PI) / 360));
  dim(space, planet !== undefined && !rig.flying, delta);
}

// `value` eased `share` of the way to `to`.
const ease = (uniform: { value: number }, to: number, share: number): void => {
  uniform.value += (to - uniform.value) * share;
};

const distance = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

// Whether the page's plate shows: it comes with its page, at the flight's 68 %, and quickly, so its fill stands before the words rise on it
// (arrival.ts).
const plated = (space: Space): boolean =>
  space.options.inChat !== true && space.place?.kind === "world" && space.neared && space.circle !== undefined;

// The chat's small view has no sky: the far suns are out but for the system seen from above, whose star stands in its middle.
const sunGain = (space: Space, paged: boolean): number =>
  space.options.inChat === true ? Number(space.plan) : paged ? PAGE.sun : 1;

function dim(space: Space, paged: boolean, delta: number): void {
  const { gains, plate, frame } = space.stage;
  const share = 1 - Math.exp(-delta / 1000 / EASE_S);
  ease(gains.sun, sunGain(space, paged), share);
  ease(gains.dust, paged ? PAGE.dust : 1, share);
  ease(gains.stars, paged ? PAGE.stars : 1, share);
  ease(plate.shown, plated(space) ? 1 : 0, 1 - Math.exp(-delta / 1000 / PLATE_S));
  const alone = aloneOf(space);
  ease(frame.uSolo, alone === undefined ? 0 : 1, share);
  if (alone !== undefined) frame.uAlone.value = alone.index;
  homeFrame(space, alone, share);
  // A lens's light comes and goes over a moment, never at once (D425); at once under reduced motion.
  ease(frame.uLens, space.lens === undefined ? 0 : 1, space.options.still() ? 1 : 1 - Math.exp(-delta / 1000 / LENS_S));
}

// The level follows the camera at rest: zoomed far out of a system, the universe; zoomed close to a system from far out, it.
function settle(space: Space): void {
  const { place, universe } = space;
  if (universe === undefined || place === undefined || place.kind === "world") return;
  const system = space.system;
  // The eye the pose has, not the camera's: on the frame after a jump the camera is aimed only below, and a small system opened at its
  // address stood far from where it last was, which left it for the universe at once (D484).
  const eye = eyeOf(space.rig.pose, space.rig.eye);
  if (system !== undefined && distance(eye, system.place) > system.reach * LEAVE) {
    space.place = { kind: "universe" };
    space.options.events.universe();
  } else if (place.kind === "universe") enter(space, universe.systems);
}

function enter(space: Space, systems: readonly System[]): void {
  // Only a zoom in enters, once the eye stands among a system's orbits: up to there the reader may near its star, and pick it.
  if (!space.rig.free.inward) return;
  const eye = space.camera.position;
  const near = systems.find(({ place, reach }) => distance(eye, place) < reach * ENTER);
  if (near === undefined) return;
  // The system is asked, not yet reached: the page it opens flies the camera the rest of the way, in the zoom's stride.
  space.place = { kind: "system", id: near.home ? HOME_SYSTEM : near.id };
  space.neared = false;
  space.options.events.system(near.id);
}

function paint(space: Space, delta: number): void {
  const { stage, rig } = space;
  stage.near?.tick(space.seconds, stage.frame.uSolo.value > 0.5 ? stage.frame.uAlone.value : -1, closeUp(space));
  space.labels.system = space.system;
  space.labels.plan = space.plan;
  space.labels.marked = space.planet;
  // No name while a flight runs: they come as it lands, never popping in and out on the way (Alexis, 2026-11-09).
  space.labels.hidden = rig.flying || space.kept !== undefined;
  space.labels.arrival = space.arrival;
  space.labels.tick(space.see, space.seconds);
  orbits(space, delta);
  round(space);
  stage.links.tick(space.plan ? (space.planet ?? space.system) : undefined, space, delta);
  const planet = space.planet;
  stage.effects.tick(rig, delta, planet === undefined ? rig.pose.look : placeOf(planet, space.seconds, PLANET_AT));
  signs(space);
  present(space);
}

// The frame, blurred while fast, then the galaxy's body over it, never through the blur's pass, which grades the frame anew.
function present({ stage, renderer, camera }: Space): void {
  stage.frame.uThrough.value = stage.effects.through ? 1 : 0;
  if (!stage.effects.draw(renderer, stage.scene, camera)) renderer.render(stage.scene, camera);
  stage.sky?.draw(renderer, camera);
}

// The planet a page frames close (D458, D459): the home's Earth on its first screen, or a page's own; none from above.
const closeUp = (space: Space): Planet | undefined =>
  space.arrival ? space.universe?.earth : space.circle?.close === true ? space.kept : undefined;

// The orbit round a planet framed close comes once the flight has landed, as the page has; its moons stand round it as it comes (D463).
function round(space: Space): void {
  const planet = closeUp(space);
  space.stage.round.follow(space.rig.flying ? undefined : planet, space.rig.pose, space.seconds);
  const { moons, round: ring } = space.stage;
  moons.follow(
    space.rig.flying ? undefined : planet,
    { seconds: space.seconds, still: space.options.still() },
    {
      turn: ring.lines.quaternion,
      eye: space.camera.position,
    },
  );
}

// The page planet's signs, once it has come: their HTML stands where their ground does, and the planet turns on past its spin to show them.
function signs(space: Space): void {
  const { planet } = space;
  if (planet === undefined || !space.neared) return;
  space.stage.ground.place(planet, space.seconds, space.see);
  space.stage.near?.lead(planet.id, space.stage.ground.ahead);
}

// The orbits of the system the camera is in, seen from above alone (the plan; none in the 3D view nor behind a page), faint, fading as it
// goes far, in and out over a moment as the view changes.
function orbits(space: Space, delta: number): void {
  const { stage, system } = space;
  stage.orbits.of(system);
  const planned = space.plan && space.place?.kind !== "universe";
  if (system === undefined || (!planned && stage.orbits.gain.value < 1e-3)) {
    stage.orbits.gain.value = 0;
    return;
  }
  const near = (system.reach * 14 - distance(space.camera.position, system.place)) / (system.reach * 9);
  // A crowded system's orbits each fainter, so that together they stay lines and never a grey disc.
  const crowd = Math.min(1, Math.sqrt(CLEAR_ORBITS / system.planets.length));
  const to = planned ? ORBIT_GAIN * crowd * Math.min(1, Math.max(0, near)) : 0;
  ease(stage.orbits.gain, to, 1 - Math.exp(-delta / 1000 / ORBITS_S));
}
