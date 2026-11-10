// What the reader's hand asks of space (scene.ts): a click or a label asks a world or a system, a wheel dives or comes back a level; the
// page's address then asks the place back.
import { listen } from "./input.ts";
import { divesInto, hitOf, pickAt, type Hit } from "./pick.ts";
import type { Space } from "./scene.ts";
import type { SpaceEvents } from "./spaceOptions.ts";

/** Asks the page for the world or the system `hit` is. */
export function enterHit(events: SpaceEvents, hit: Hit): void {
  if ("planet" in hit) events.world(hit.planet.id);
  else events.system(hit.system.id);
}

// A level up, from where space is seen: never from under a page that covers it, nor from under the full chat.
function levelUp({ place, planet, seen, options: { events } }: Space): void {
  if (!seen) return;
  if (planet !== undefined) events.system(planet.system.id);
  else if (place?.kind === "system" || place?.kind === "home") events.universe();
}

/** The reader's hand on `space`'s canvas and names, until `signal` aborts. */
export function wireHands(space: Space, signal: AbortSignal): void {
  const { options, labels, rig, camera, see } = space;
  listen(
    {
      canvas: options.canvas,
      labels: options.labels,
      rig,
      camera,
      screen: see.screen,
      under: (x, y, target) => {
        const named = labels.itemAt(target);
        if (named !== undefined || space.universe === undefined) return named && hitOf(named);
        return pickAt(space.universe, { x, y }, { seen: see, seconds: space.seconds, only: space.lens });
      },
      // In a system a wheel in over a planet dives there (from the Map once it stands large); over the universe it only nears.
      deeper: (hit) => divesInto(hit, space),
      enter: (hit) => {
        enterHit(options.events, hit);
      },
      up: () => {
        levelUp(space);
      },
    },
    signal,
  );
}
