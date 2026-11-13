// A frame's moves (D401): the rig and the page's hold, the level, the eased values, the names, the effects and the frame's last draw.
// Split from the loop (frame.ts), which decides whether the frame is drawn.
import { damp } from "@gnoworld/core";
import type { Space } from "./scene.ts";
import { placeOf, type Planet, type System, type Vec } from "./layout.ts";
import { ORBIT_GAIN } from "./parts/marks.ts";
import { frameOf } from "./parts/bones.ts";
import { Quaternion } from "three";
import { HOME_SYSTEM } from "../cosmosAt.ts";
import { aloneOf, homeFrame, nearAlone } from "./framing.ts";
import { followHome } from "./follow.ts";
import { handOf } from "./hand.ts";
import { hoverLit, settleHover } from "./hover.ts";
import { eyeOf } from "./rig/pose.ts";
import { coveredByChat } from "./motion.ts";
import { tick } from "./view.ts";
import { open, openedOf } from "./open.ts";

// On a page the universe dims as the demo's behind a plate: the suns to 0.45, the dust to 0.15, the stars to half.
const PAGE = { sun: 0.45, dust: 0.15, stars: 0.5 } as const;
const EASE_S = 0.6;
const PLATE_S = 0.16;
// raw: a lens dims what it does not light over about half a second, the design system's slow motion
const LENS_S = 0.18;
const ORBITS_S = 0.3;
// Where the page's planet stands this frame, for the scan.
const PLANET_AT: Vec = { x: 0, y: 0, z: 0 };
const SCAN_FRAME = new Quaternion();
// The level follows the zoom: out of a system past 11 of its reaches, the universe; the eye among a system's orbits, that system.
const LEAVE = 11;
const ENTER = 1.2;
// raw: how many orbits a system draws at their full strength
const CLEAR_ORBITS = 12;

// `slept` seconds more went by while the loop slept: the clock the orbits ride takes them at its rate; the steps (`delta`) never do.
export function advance(
  space: Space,
  delta: number,
  { real = delta, slept = 0 }: { real?: number; slept?: number } = {},
): void {
  const { rig, stage } = space;
  const still = space.options.still();
  tick(space, delta + slept * 1000);
  rig.advance(delta, still, real);
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
    handOf(space, still);
    settle(space);
  }
  stage.intro.tick(delta, space);
  stage.intro.aim(space);
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
  const share = damp(delta / 1000, EASE_S);
  // The full chat coming over the scene dims it out with the chat's growth (and back in with its shrinking): the scene draws on for that moment
  // (scene.ts's `seen`), never freezing as the chat's mark is set.
  const veil = space.options.inChat !== true && coveredByChat() ? 0 : 1;
  ease(gains.sun, sunGain(space, paged) * veil, share);
  ease(gains.dust, (paged ? PAGE.dust : 1) * veil, share);
  ease(gains.stars, (paged ? PAGE.stars : 1) * veil, share);
  ease(plate.shown, plated(space) ? 1 : 0, damp(delta / 1000, PLATE_S));
  plate.sync();
  const alone = aloneOf(space);
  ease(frame.uSolo, alone === undefined ? 0 : 1, share);
  if (alone !== undefined) frame.uAlone.value = alone.index;
  homeFrame(space, alone, share);
  lighten(space, delta);
}

// A lens's, or a pointed planet's, light comes and goes over a moment, never at once (D425); at once under reduced motion.
function lighten(space: Space, delta: number): void {
  settleHover(space);
  const on = space.lens !== undefined || hoverLit(space) !== undefined;
  ease(space.stage.frame.uLens, on ? 1 : 0, space.options.still() ? 1 : damp(delta / 1000, LENS_S));
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

export function paint(space: Space, delta: number): void {
  const { stage, rig } = space;
  // The page planet's ground first, so the planet is drawn with the spin and lean its signs stand by on this frame, not the last's.
  signs(space, delta / 1000);
  stage.near?.tick(space.seconds, {
    alone: nearAlone(stage.frame),
    close: closeUp(space),
    delta: delta / 1000,
    still: space.options.still(),
    // How far the sun has gone dim for a page (its gain, eased): 0 where it is drawn, 1 on a page where it is not (D13002).
    page: Math.min(1, Math.max(0, (1 - stage.gains.sun.value) / (1 - PAGE.sun))),
  });
  space.labels.system = space.system;
  // A system opened with no input (an arrival by code) after the rest stopped the clock starts the minute over: its fade runs on that clock.
  const opened = open(stage.frame, openedOf(space, stage.frame.uOpenNow.value), {
    seconds: space.seconds,
    still: space.options.still(),
  });
  if (opened) rig.free.rouse();
  space.labels.plan = space.plan;
  space.labels.marked = space.planet;
  // No name while a flight runs: they come as it lands, never popping in and out on the way (Alexis, 2026-11-09).
  space.labels.hidden = rig.flying || space.kept !== undefined;
  space.labels.arrival = space.arrival;
  space.labels.ready = stage.intro.ready;
  space.labels.tick(space.see, space.seconds);
  orbits(space, delta);
  round(space, delta);
  stage.links.tick(space.plan ? (space.planet ?? space.system) : undefined, space, delta);
  const planet = space.planet;
  stage.effects.tick(rig, delta, {
    at: planet === undefined ? rig.pose.look : placeOf(planet, space.seconds, PLANET_AT),
    frame:
      planet === undefined
        ? undefined
        : frameOf(
            planet,
            { seconds: space.seconds, leaned: stage.ground.leaned, ahead: stage.ground.ahead },
            SCAN_FRAME,
          ),
  });
}

// The frame, blurred while fast, then the galaxy's body over it, never through the blur's pass, which grades the frame anew.
export function present({ stage, renderer, camera }: Space): void {
  if (!stage.effects.draw(renderer, stage.scene, camera)) renderer.render(stage.scene, camera);
  stage.sky?.draw(renderer, camera);
}

// The planet a page frames close (D458, D459): the home's Earth on its first screen, or a page's own; none from above.
const closeUp = (space: Space): Planet | undefined =>
  space.arrival ? space.universe?.earth : space.circle?.close === true ? space.kept : undefined;

// The orbit round a planet framed close comes once the flight has landed, as the page has; its moons stand round it as it comes (D463).
function round(space: Space, delta: number): void {
  const planet = closeUp(space);
  space.stage.round.follow(space.rig.flying ? undefined : planet, space.rig.pose, {
    seconds: space.seconds,
    delta: delta / 1000,
  });
  const { moons, round: ring } = space.stage;
  moons.follow(
    space.rig.flying ? undefined : planet,
    { seconds: space.seconds, delta: delta / 1000, still: space.options.still() },
    {
      turn: ring.lines.quaternion,
      eye: space.camera.position,
    },
  );
  space.stage.near?.eclipse(space.rig.flying ? undefined : planet, moons.shadows);
}

// The page planet's signs, once it has come: their HTML stands where their ground does, and the planet turns on past its spin to show them.
function signs(space: Space, step: number): void {
  const { planet } = space;
  if (planet === undefined) return;
  const { ground, near } = space.stage;
  // Neither the spin nor the lean starts while a flight brings the planet or takes the eye from it, nor before the planet has come; the lean
  // eases back to rest then.
  if (space.neared && !space.rig.flying) {
    ground.grab.advance(step, space.camera.quaternion, space.options.still());
    ground.place(planet, { seconds: space.seconds, step }, space.see);
  } else {
    ground.grab.stop();
    ground.rest(planet, step);
  }
  near?.lead(planet.id, ground.ahead, ground.leaned);
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
  ease(stage.orbits.gain, to, damp(delta / 1000, ORBITS_S));
}
