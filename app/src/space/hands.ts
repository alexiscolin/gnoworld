// What the reader's hand asks of space (scene.ts): a click or a label asks a world or a system, a wheel dives or comes back a level; the
// page's address then asks the place back.
import { EARTH } from "@gnoworld/core";
import { scaleOf } from "./boosts.ts";
import { listen, type Turner } from "./input.ts";
import { hoverOver } from "./hover.ts";
import { placeOf, type Vec } from "./layout.ts";
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

const AT: Vec = { x: 0, y: 0, z: 0 };

// Whether a drag turns the planet, not the camera (D13011): on a generated world's page, drawn as itself and at rest. The Earth keeps its real
// hour (D13947), and the system's and the galaxy's views have no page planet.
function turns(space: Space): boolean {
  const { kept: planet, rig, place, neared, stage } = space;
  return (
    planet !== undefined &&
    planet.id !== EARTH &&
    place?.kind === "world" &&
    neared &&
    !rig.flying &&
    stage.near?.shows(planet.index) === true
  );
}

/** A finger's drag on the canvas is the page's to scroll, but for a world's planet it turns: the browser must not take it over. */
export function touchOf(space: Space): void {
  const { style } = space.options.canvas;
  const touch = turns(space) ? "none" : "";
  if (style.touchAction !== touch) style.touchAction = touch;
}

function turnerOf(space: Space): Turner | undefined {
  const { kept: planet, stage } = space;
  if (planet === undefined || !turns(space)) return undefined;
  const { ground } = stage;
  return {
    drag: ({ dx, dy, seconds }) => {
      // The planet's radius on screen, in pixels: a drag across its disc turns it as far as the pointer moved over its surface.
      const radius =
        space.see.pixels(placeOf(planet, space.seconds, AT), 2 * planet.radius * scaleOf(planet.index)) / 2;
      ground.grab.drag({ dx, dy, seconds, radius: Math.max(radius, 1) });
      space.touch();
    },
    release: (stood) => {
      ground.grab.release(stood);
    },
  };
}

/** The reader's hand on `space`'s canvas and names, until `signal` aborts. */
export function wireHands(space: Space, signal: AbortSignal): void {
  const { options, labels, rig, camera, see } = space;
  // A name pointed at, focused or left: a planet's lights its links in the Map.
  labels.hover = (item) => {
    hoverOver(space, item !== undefined && "system" in item ? item : undefined);
  };
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
        return pickAt(
          space.universe,
          { x, y },
          { seen: see, seconds: space.seconds, only: space.lens, open: space.system },
        );
      },
      // In a system a wheel in over a planet dives there (from the Map once it stands large); over the universe it only nears.
      turner: () => turnerOf(space),
      over: (hit) => {
        hoverOver(space, hit !== undefined && "planet" in hit ? hit.planet : undefined);
      },
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
