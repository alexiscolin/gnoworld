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

type Camera = ReturnType<typeof cameraTowards>;
// Each screen's look at the Plan's worlds, and the worlds from the largest down.
function seenFrom(system: StarSystem, worlds: readonly Orbiter[], { camera, lens }: { camera: Camera; lens: number }) {
  const looks = looksFrom(camera, lens).map((look) => ({
    look,
    spots: worlds.map((world) => look.seen(placeOf(system, world, 0), world.radius)),
  }));
  return {
    looks,
    bySize: worlds.map((_, at) => at).sort((a, b) => (worlds[b]?.radius ?? 0) - (worlds[a]?.radius ?? 0)),
  };
}
type Seen = ReturnType<typeof seenFrom>;
type Spot = Seen["looks"][number]["spots"][number];

// Whether `room` for the `at`th world's spot stands whole on every screen and meets no other world, nor a name where `named` says one is.
const clearAt = (
  looks: Seen["looks"],
  at: number,
  { room, named }: { room: (spot: Spot) => Box; named: (index: number) => boolean },
) =>
  looks.every(({ look, spots }) => {
    const spot = spots[at];
    if (spot === undefined) return false;
    const box = room(spot);
    return (
      look.whole({ ...box, depth: spot.depth }, MARGIN) &&
      spots.every((other, index) => index === at || !meet(box, boxOf(other, named(index))))
    );
  });

// The room a "+N" takes under a world, as a name's.
const under = ({ x, y, radius }: Spot): Box => ({
  left: x - NAME_HALF,
  right: x + NAME_HALF,
  top: y + radius,
  bottom: y + radius + NAME_HIGH,
});

/** Every world named where the Plan is readable; where it is `crowded`, as many as there is room for, the largest first, each whose name's
 * room meets no world nor a name kept before it (F5462); and the world whose name's place its "+N" takes: under the largest unnamed world it
 * stands clear under, else with the smallest named world gone into the count, till it stands clear or no name is left (G2, the chief). */
export function namesOf(
  system: StarSystem,
  worlds: readonly Orbiter[],
  { camera, lens, crowded }: { camera: Camera; lens: number; crowded: boolean },
): { named: ReadonlySet<string>; host: string | undefined } {
  if (!crowded) return { named: new Set(worlds.map(({ id }) => id)), host: undefined };
  const { looks, bySize } = seenFrom(system, worlds, { camera, lens });
  const named = new Set<string>();
  const isNamed = (at: number) => named.has(worlds[at]?.id ?? "");
  for (const at of bySize) if (clearAt(looks, at, { room: boxOf, named: isNamed })) named.add(worlds[at]?.id ?? "");
  const host = hostOf({ looks, bySize }, isNamed, (at) => named.delete(worlds[at]?.id ?? ""));
  return { named, host: host === undefined ? undefined : worlds[host]?.id };
}

// The "+N"'s world, by its place among `bySize`: an unnamed one it stands clear under, the largest, else `unname` the smallest named and again.
function hostOf(
  { looks, bySize }: Seen,
  named: (at: number) => boolean,
  unname: (at: number) => void,
): number | undefined {
  for (;;) {
    const unnamed = bySize.filter((at) => !named(at));
    const host = unnamed.find((at) => clearAt(looks, at, { room: under, named }));
    const smallest = [...bySize].reverse().find(named);
    if (host !== undefined || smallest === undefined || unnamed.length === 0) return host ?? unnamed[0];
    unname(smallest);
  }
}
