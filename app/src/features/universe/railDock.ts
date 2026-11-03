// The rail's dock (ADR-0002 §1's rail, "magnified like a dock under the pointer"): the planet at the pointer, or the one the keyboard is on,
// grows most and its neighbours less by their distance, each easing there frame by frame, and no frame is asked once all stand still. As a
// dock's, distances are read on the column at rest, measured with nothing grown nor shifted, and the column shifts so the pointed planet
// stays under the pointer. Never under reduced motion, nor for a finger or where nothing hovers, a touch screen.

/** How much the planet at the pointer grows, and how far from it, in pixels, its neighbours still do. */
export const MAGNIFIED = 1.55;
export const REACH = 230;
const EASE = 0.2;
const STILL = 0.002;
const QUIET = "(prefers-reduced-motion: reduce), (pointer: coarse)";

// How much a planet `distance` pixels from the pointer grows: the most at it, smoothly none from `REACH` on.
const magnifiedAt = (distance: number): number =>
  distance >= REACH ? 1 : 1 + ((MAGNIFIED - 1) * (1 + Math.cos((Math.PI * distance) / REACH))) / 2;

// A link at rest, from the list's own top: where it starts, its height, its planet's side.
interface Rest {
  readonly offset: number;
  readonly height: number;
  readonly planet: number;
}

// The links at rest, read with every planet at its size and the list unshifted, then put back as they stood; and the list's top within
// its column's content, which `scroller` scrolls.
function restOf(
  list: HTMLElement,
  scroller: HTMLElement,
  links: readonly HTMLElement[],
): { rests: Rest[]; lead: number } {
  const planets = links.map((link) =>
    link.firstElementChild instanceof HTMLElement ? link.firstElementChild : undefined,
  );
  const grown = planets.map((planet) => planet?.style.getPropertyValue("--_mag") ?? "");
  const shifted = list.style.getPropertyValue("translate");
  for (const planet of planets) planet?.style.removeProperty("--_mag");
  list.style.removeProperty("translate");
  const top = list.getBoundingClientRect().top;
  const rests = links.map((link, at) => {
    const box = link.getBoundingClientRect();
    return { offset: box.top - top, height: box.height, planet: planets[at]?.getBoundingClientRect().height ?? 0 };
  });
  const lead = top - scroller.getBoundingClientRect().top + scroller.scrollTop;
  planets.forEach((planet, at) => planet?.style.setProperty("--_mag", grown[at] ?? ""));
  list.style.setProperty("translate", shifted);
  return { rests, lead };
}

// The link the place `at` falls in at rest, or the nearest; its index, or -1 with none.
function heldAt(rests: readonly Rest[], top: number, at: number): number {
  let nearest = -1;
  let best = Number.POSITIVE_INFINITY;
  for (const [index, { offset, height }] of rests.entries()) {
    const away = Math.max(top + offset - at, at - (top + offset + height), 0);
    if (away < best) [nearest, best] = [index, away];
  }
  return nearest;
}

// The column as a frame reads it: its links, each at rest, the list's top within the column's content, and its top on the page as if it
// stood unshifted, read off the column, which the list's shift never moves, so it moves with the scroll alone.
interface Column {
  readonly links: readonly HTMLElement[];
  readonly rests: readonly Rest[];
  readonly lead: number;
  readonly top: number;
}

// How far the list must move so the place `at` its link held at rest, its planet's middle and the offset from it as the planet grew, comes
// back under `at`: read off the page once the planets have their new sizes. A link with no planet keeps its place.
function driftOf({ links, rests, top }: Column, at: number): number {
  const held = heldAt(rests, top, at);
  const [link, rest] = [links[held], rests[held]];
  if (link === undefined || rest === undefined) return 0;
  const live = link.getBoundingClientRect();
  const planet = link.firstElementChild?.getBoundingClientRect().height ?? 0;
  if (rest.planet <= 0) return live.top - (top + rest.offset);
  const scale = planet / rest.planet;
  return live.top + planet / 2 + (at - (top + rest.offset + rest.planet / 2)) * scale - at;
}

// Each planet a step nearer the size `at` gives it, written on it; whether any changed.
function grow({ links, rests, top }: Column, sizes: WeakMap<Element, number>, at: number | undefined): boolean {
  let moving = false;
  for (const [index, link] of links.entries()) {
    const rest = rests[index];
    const target =
      at === undefined || rest === undefined ? 1 : magnifiedAt(Math.abs(at - top - rest.offset - rest.height / 2));
    const now = sizes.get(link) ?? 1;
    const next = Math.abs(target - now) < STILL ? target : now + (target - now) * EASE;
    moving ||= next !== now;
    sizes.set(link, next);
    if (link.firstElementChild instanceof HTMLElement)
      link.firstElementChild.style.setProperty("--_mag", next.toFixed(4));
  }
  return moving;
}

/** Grows the planets of `list`'s links, each by the `--_mag` written on it (ui's PlanetThumb), and shifts the list as a dock's, until
 * `signal` ends. */
export function dock(list: HTMLElement, signal: AbortSignal): void {
  // The column the list scrolls in: a list with none is no rail's.
  const scroller = list.parentElement;
  if (scroller === null) return;
  const sizes = new WeakMap<Element, number>();
  let column: Column = { links: [], rests: [], lead: 0, top: 0 };
  let pointer: number | undefined;
  let focused: Element | undefined;
  // The place the column holds still: the last one aimed at, while the planets shrink back.
  let [anchor, shift, frame] = [0, 0, 0];
  // The links at rest, measured once the list holds other links: a link's height is its own, 98 px at least, whatever its name's font.
  const read = (): Column => {
    const links = [...list.querySelectorAll<HTMLElement>("li > a")];
    const same = links.length === column.links.length && links.every((link, at) => link === column.links[at]);
    const { rests, lead } = same ? column : restOf(list, scroller, links);
    return { links, rests, lead, top: scroller.getBoundingClientRect().top + lead - scroller.scrollTop };
  };
  const step = () => {
    frame = 0;
    column = read();
    const { rests, top } = column;
    const focus = rests[column.links.findIndex((link) => link === focused)];
    const at = matchMedia(QUIET).matches ? undefined : (pointer ?? (focus && top + focus.offset + focus.height / 2));
    const moving = grow(column, sizes, at);
    anchor = at ?? anchor;
    // The drift is read off the page once the planets have their sizes, so one shift puts the anchor back under the pointer.
    shift += driftOf(column, anchor);
    list.style.setProperty("translate", `0 ${String(-shift)}px`);
    if (moving) frame = requestAnimationFrame(step);
  };
  const aim = () => {
    frame ||= requestAnimationFrame(step);
  };
  const on = { signal };
  list.addEventListener(
    "pointermove",
    ({ clientY, pointerType }) => {
      if (pointerType === "touch") return;
      pointer = clientY;
      aim();
    },
    on,
  );
  list.addEventListener(
    "pointerleave",
    () => {
      pointer = undefined;
      aim();
    },
    on,
  );
  list.addEventListener(
    "focusin",
    ({ target }) => {
      focused = target instanceof Element ? target : undefined;
      aim();
    },
    on,
  );
  list.addEventListener(
    "focusout",
    () => {
      focused = undefined;
      aim();
    },
    on,
  );
  list.parentElement?.addEventListener("scroll", aim, on);
  signal.addEventListener("abort", () => {
    cancelAnimationFrame(frame);
  });
}
