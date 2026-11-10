// What the loop reads and writes of a Space each frame (frame.ts): its state between frames, the frame's pace and size, the numbers a frame is
// drawn from, and the pixels a second its slow motions move.
import { pixelRatioFor } from "@gnoworld/core";
import type { Space } from "./scene.ts";
import { placeOf, type Vec } from "./layout.ts";
import { lowered, raised, type Verdict } from "./pace.ts";
import { napFor } from "./rest.ts";
import type { Moment, Need } from "./redraw.ts";
import { shownOf } from "./shown.ts";

// A slow planet's spin, in radians a second, at most (shaders/planets.ts): the pixels it moves a second are its radius's.
const SPIN_MOST = 0.08;
const CHOOSE_MS = 100;
const AT: Vec = { x: 0, y: 0, z: 0 };

// What the loop keeps between frames: the need of the last, the slow motions' speed, whether the canvas's box changed or its buffer was
// freed, when the last frame came, and the place and universe it saw.
export interface State {
  need: Need;
  pxPerSecond: number;
  sized: boolean;
  /** When the near planets were last chosen, and what they are chosen by, written each time: a frame makes nothing. */
  chose: number;
  readonly choosing: { pxK: number; seconds: number };
  freed: boolean;
  ticked: number;
  place: Space["place"];
  universe: Space["universe"];
  /** The frame's numbers, written each time: a frame makes nothing. */
  readonly numbers: { readonly eye: number[]; readonly shown: number[] };
}

export const stateOf = (space: Space): State => ({
  need: "full",
  pxPerSecond: 0,
  sized: true,
  freed: false,
  ticked: -1,
  chose: 0,
  choosing: { pxK: 0, seconds: 0 },
  place: space.place,
  universe: space.universe,
  numbers: { eye: [0, 0, 0, 0, 0, 0, 1], shown: [] },
});

// Where the frames miss their beat unevenly the ratio steps down; where they have kept up long after, it steps back up (P106).
function slow(space: Space, verdict: Verdict): void {
  const { keep, renderer } = space;
  if (verdict === "down") keep.ratioCap = lowered(renderer.getPixelRatio());
  else if (verdict === "up") keep.ratioCap = raised(renderer.getPixelRatio());
}

// The frames' pace (P106): each frame the screen gave is timed, and where the median cannot keep up the ratio steps down, for good.
// Not under automation, whose software GL is slow by nature.
export function pace(space: Space, state: State, now: number): void {
  const { place, universe } = space;
  if (place !== state.place || universe !== state.universe || state.ticked < 0) space.keep.governor.reset();
  else if (!navigator.webdriver) slow(space, space.keep.governor.feed(now - state.ticked));
  [state.ticked, state.place, state.universe] = [now, place, universe];
}

// The pixels drawn per page pixel: the screen's, two at most, one on a touch screen or where the settings ask for low quality; less once
// the frames could not keep up (`cap`).
const touch = matchMedia("(pointer: coarse)");
export const ratioOf = (cap = Infinity): number =>
  Math.min(
    cap,
    pixelRatioFor(
      devicePixelRatio,
      touch.matches,
      document.documentElement.dataset["quality"] === "low" ? "low" : "high",
    ),
  );

// Whether the buffer changed: its size is read only once the canvas's box changed (a layout read), its ratio each frame.
export function resize(space: Space, boxChanged: boolean, force: boolean): boolean {
  const { canvas } = space.options;
  const ratio = ratioOf(space.keep.ratioCap);
  if (!boxChanged && !force && ratio === space.renderer.getPixelRatio()) return false;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (
    !force &&
    width === space.see.screen.width &&
    height === space.see.screen.height &&
    ratio === space.renderer.getPixelRatio()
  )
    return false;
  space.renderer.setPixelRatio(ratio);
  space.see.screen.width = width;
  space.see.screen.height = height;
  space.renderer.setSize(width, height, false);
  space.camera.aspect = width / Math.max(height, 1);
  space.replate();
  return true;
}

// The camera, the lens, the size and every uniform the frame is drawn from, with what moves.
export function momentOf(space: Space, { numbers: { eye, shown }, pxPerSecond }: State): Moment {
  const { camera, stage, see, renderer } = space;
  const { position: at, quaternion: turn } = camera;
  [eye[0], eye[1], eye[2], eye[3], eye[4], eye[5], eye[6]] = [at.x, at.y, at.z, turn.x, turn.y, turn.z, turn.w];
  const lens = camera.projectionMatrix.elements;
  shown.length = 0;
  shown.push(
    camera.fov,
    lens[0],
    lens[5],
    lens[8],
    lens[9],
    renderer.getPixelRatio(),
    see.screen.width,
    see.screen.height,
  );
  shown.push(space.options.still() ? 1 : 0, space.universe === undefined ? 0 : 1);
  return {
    eye,
    shown: shownOf(stage.scene, shown),
    pxK: see.pxK,
    distance: space.rig.pose.distance,
    seconds: space.seconds,
    pxPerSecond,
    moving: moves(space),
  };
}

// Whether each frame differs by itself: a flight, the hand, an effect, an arrival or a planet framed close; the last two only while the
// scene's clock runs (rig/free.ts's rate: stopped after a minute's rest, the page's planet stands still).
const moves = ({ rig, stage, arrival, circle }: Space): boolean =>
  rig.flying || rig.free.moving || stage.effects.busy || ((arrival || circle?.close === true) && rig.free.rate > 0);

// The pixels a second the fastest slow motion moves: a planet's orbit and its spin, those of the page's planet, the system's or all.
function pixelsPerSecond(space: Space): number {
  const eyeAt = space.camera.position;
  const k = space.see.pxK;
  const near = space.kept;
  const planets = near === undefined ? (space.system?.planets ?? space.universe?.planets ?? []) : [near];
  let fastest = 0;
  for (const planet of planets) {
    placeOf(planet, space.seconds, AT);
    const away = Math.max(Math.hypot(AT.x - eyeAt.x, AT.y - eyeAt.y, AT.z - eyeAt.z) * k, 1e-9);
    fastest = Math.max(fastest, (Math.abs(planet.speed) * planet.orbit + SPIN_MOST * planet.radius) / away);
  }
  return fastest;
}

/** How long the loop may sleep after this frame; none, it stays awake. A stopped clock (rate 0) moves nothing, so no slow motion keeps it up. */
export const napOf = (space: Space, state: State, { need, calm }: { need: Need; calm: number }): number | undefined =>
  napFor({
    need,
    moving: moves(space) || space.rig.free.turning,
    settled: space.labels.settled(),
    calm,
    pxPerSecond: space.rig.free.rate === 0 ? 0 : state.pxPerSecond,
  });

/** Runs the scene's clock `ms` on, at the rate the rest has left it (rig/free.ts). The place of a thing goes by it; an ease goes by the frame's own delta. */
export const tick = (
  space: { seconds: number; readonly rig: { readonly free: { readonly rate: number } } },
  ms: number,
): void => {
  space.seconds += (ms / 1000) * space.rig.free.rate;
};

/** A few times a second: the slow motions' speed, and which near planets are drawn as themselves. */
export function choose(space: Space, state: State, now: number): void {
  if (now - state.chose <= CHOOSE_MS || space.universe === undefined) return;
  state.chose = now;
  state.choosing.pxK = space.see.pxK;
  state.choosing.seconds = space.seconds;
  state.pxPerSecond = pixelsPerSecond(space);
  space.stage.near?.choose(space.universe, space.camera.position, state.choosing);
}
