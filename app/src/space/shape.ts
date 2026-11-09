// The featured worlds' boosts (D549, D551, D555): during the flight that lands on the home each is sized for its layer as the flight goes,
// grown in by the flight's own progress (framing.ts); once landed each keeps the boost it landed with, so at rest only the perspective
// changes its size. Leaving the home they shrink with the frame's easing, never at once.
import type { Space } from "./scene.ts";
import { boosts } from "./boosts.ts";
import { placeOf, type Planet } from "./layout.ts";
import { latch, type Featured } from "./vista.ts";

// Each slot's world and the boost it landed with, in pairs as `boosts` (-1: none).
const held = new Float32Array(boosts.value.length).fill(-1);

// Where `planet` stands on screen in the pose's view, and how deep.
function screenOf(space: Space, planet: Planet): { x: number; y: number; z: number } | undefined {
  const { rig, circle, seconds } = space;
  if (circle === undefined) return undefined;
  const { pose, eye } = rig;
  const f = circle.height / 2 / Math.tan((pose.fov * Math.PI) / 360);
  const [look, up, at] = [
    { x: -pose.way.x, y: -pose.way.y, z: -pose.way.z },
    pose.up,
    placeOf(planet, seconds, { x: 0, y: 0, z: 0 }),
  ];
  const d = { x: at.x - eye.x, y: at.y - eye.y, z: at.z - eye.z };
  const z = d.x * look.x + d.y * look.y + d.z * look.z;
  const right = {
    x: look.y * up.z - look.z * up.y,
    y: look.z * up.x - look.x * up.z,
    z: look.x * up.y - look.y * up.x,
  };
  return {
    x: circle.x + (f * (d.x * right.x + d.y * right.y + d.z * right.z)) / z,
    y: circle.y - (f * (d.x * up.x + d.y * up.y + d.z * up.z)) / z,
    z,
  };
}

// The boost that draws the layer's world `size` of the screen's height across its radius, from where the camera is now.
function boostOf(space: Space, { planet, share: size }: Featured): number {
  const { circle, rig } = space;
  const spot = screenOf(space, planet);
  if (circle === undefined || spot === undefined || spot.z <= 0) return 1;
  const [f, px] = [circle.height / 2 / Math.tan((rig.pose.fov * Math.PI) / 360), size * circle.height];
  return Math.min(12, Math.max(0.3, (px * spot.z) / (f * planet.radius)));
}

export function shapeBoosts(space: Space): void {
  boosts.value.fill(-1);
  // Off the home the set goes once its worlds have shrunk back.
  if (space.place?.kind !== "home" && boosts.gate < 0.01) latch.featured = [];
  for (const [slot, featured] of latch.featured.entries()) {
    const { index } = featured.planet;
    if (space.rig.flying || held[slot * 2] !== index)
      [held[slot * 2], held[slot * 2 + 1]] = [index, boostOf(space, featured)];
    boosts.value[slot * 2] = index;
    boosts.value[slot * 2 + 1] = held[slot * 2 + 1] ?? 1;
  }
}
