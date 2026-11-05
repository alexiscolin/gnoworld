// The names a Plan stands under its worlds (part 7v; F5462): each name's room on the screen, and which worlds a Plan names when it has no room
// for all, the largest first.
import type { Orbiter, StarSystem } from "../cosmos/system.ts";
import { looksFrom, placeOf, type cameraTowards } from "./restLook.ts";

// A name's room under its world, in pixels: its height, and half its width at the least.
const NAME_HIGH = 30;
const NAME_HALF = 60;
/** How far in from the screen's edges a world and its name stand, in pixels. */
export const MARGIN = 16;

// A world's box on the screen, its name's room under it where it is named; and whether two such boxes meet.
export const boxOf = ({ x, y, radius }: { x: number; y: number; radius: number }, named = true) => ({
  left: x - (named ? Math.max(radius, NAME_HALF) : radius),
  right: x + (named ? Math.max(radius, NAME_HALF) : radius),
  top: y - radius,
  bottom: y + radius + (named ? NAME_HIGH : 0),
});
type Box = ReturnType<typeof boxOf>;
export const meet = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

// The worlds a Plan names, the largest first, each whose name's room stands whole on every screen and meets no world nor a name kept before
// it (F5462): every world where the Plan is readable, as many as there is room for where it is not.
export function namedIn(
  system: StarSystem,
  worlds: readonly Orbiter[],
  { camera, lens }: { camera: ReturnType<typeof cameraTowards>; lens: number },
): Set<string> {
  const looks = looksFrom(camera, lens).map((look) => ({
    look,
    spots: worlds.map((world) => look.seen(placeOf(system, world, 0), world.radius)),
  }));
  const named = new Set<string>();
  const order = worlds.map((_, at) => at).sort((a, b) => (worlds[b]?.radius ?? 0) - (worlds[a]?.radius ?? 0));
  for (const at of order) {
    const fits = looks.every(({ look, spots }) => {
      const spot = spots[at];
      if (spot === undefined) return false;
      const room = { ...boxOf(spot), depth: spot.depth };
      return (
        look.whole(room, MARGIN) &&
        spots.every((other, index) => index === at || !meet(room, boxOf(other, named.has(worlds[index]?.id ?? ""))))
      );
    });
    if (fits) named.add(worlds[at]?.id ?? "");
  }
  return named;
}
