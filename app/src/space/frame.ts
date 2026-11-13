// The engine's frame (D401): each frame the rig moves the camera, the page's hold and the level follow it, the stage's planets, names,
// orbits, lights and effects follow the camera, and the frame is drawn, blurred while fast, when it would differ from the last (redraw.ts).
// When the loop runs, sleeps and wakes is loop.ts's.
import type { Space } from "./scene.ts";
import { sharpener } from "./sharp.ts";
import { loop, type Beat } from "./loop.ts";
import { motionOf } from "./motion.ts";
import { advance, paint, present } from "./move.ts";
import { touchOf } from "./hands.ts";
import { onResize } from "./onResize.ts";
import { choose, livelyOf, momentOf, napOf, pace, resize, stateOf } from "./view.ts";

/** Runs `space`'s loop till `signal` aborts; `space.keep.wake` wakes it where it sleeps. */
export function draw(space: Space, signal: AbortSignal): void {
  const sharpen = sharpener(space, performance.now());
  const state = stateOf(space);
  let drawn = false;
  const beat: Beat = {
    gone: () => space.disposed,
    unseen: () => {
      const unseen = !space.seen || document.hidden || space.renderer.getContext().isContextLost();
      if (unseen) space.stage.near?.settle();
      return unseen;
    },
    focused: () => document.hasFocus(),
    watch: (now) => {
      pace(space, state, now);
    },
    work: ({ now, delta, slept, real }) => {
      if (resize(space, state.sized, state.freed)) space.touch();
      state.sized = state.freed = false;
      advance(space, delta, { real, slept });
      choose(space, state, now);
      paint(space, delta);
      touchOf(space);
      space.stage.frame.uThrough.value = space.stage.effects.through ? 1 : 0;
      // Something that moves by itself is drawn each frame (at 15 fps, loop.ts), though nothing crossed half a pixel (D13013).
      space.keep.redraw.live = livelyOf(space, state);
      state.need = space.keep.redraw.check(momentOf(space, state));
      if (state.need !== "none") present(space);
      if (!drawn && space.universe !== undefined) {
        drawn = true;
        space.options.events.drawn();
      }
      sharpen(now);
      return state.need;
    },
    nap: (need, calm) => {
      const nap = napOf(space, state, { need, calm });
      if (nap !== undefined) state.ticked = -1;
      return nap;
    },
    lively: () => space.keep.redraw.live,
    rouse: () => {
      space.rig.free.rouse();
    },
    free: () => {
      if (space.disposed || space.renderer.getContext().isContextLost()) return;
      space.renderer.setSize(1, 1, false);
      space.stage.effects.free();
      state.freed = true;
    },
    resized: () => {
      state.sized = true;
    },
  };
  loop(beat, space.keep, {
    page: document,
    window,
    canvas: space.options.canvas,
    marks: (changed, on) => {
      motionOf().watch(changed, on);
    },
    box: (run, on) => {
      onResize(space.options.canvas, run, on);
    },
    signal,
  });
}
