// The Earth's ground the page's signs stand on (space/earth/ground.ts), as the page reaches it: the marks are held till space runs, then
// handed to it; what faces the eye and the turn to a place go through it once it does.
import type { Space } from "./space/scene.ts";
import type { Ground, GroundMark } from "./space/earth/ground.ts";

/** A ground on its own engine, the marks held till `attach` hands it a Space: the page's (below) or a small view's. */
export function groundOn(): { ground: Ground; attach: (space: Space | undefined) => void } {
  let engine: Space | undefined;
  let marks: readonly GroundMark[] = [];
  return {
    attach: (space) => {
      engine = space;
      space?.stage.ground.setMarks(marks);
    },
    ground: {
      setMarks: (next) => {
        marks = next;
        engine?.stage.ground.setMarks(next);
      },
      facing: () => {
        const earth = engine?.universe?.earth;
        return engine === undefined || earth === undefined
          ? undefined
          : engine.stage.ground.facing(earth, engine.seconds, engine.camera.position);
      },
      face: (place) => {
        const space = engine;
        const earth = space?.universe?.earth;
        if (space !== undefined && earth !== undefined)
          space.rig.fly(space.stage.ground.faceGoal(place, { earth, seconds: () => space.seconds }, space.rig.pose));
      },
    },
  };
}

/** The page's own, on its engine (space.ts attaches it). */
export const { ground, attach } = groundOn();
