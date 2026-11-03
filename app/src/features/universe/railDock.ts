// The rail's dock (ADR-0002 §1's rail, "magnified like a dock under the pointer"): the planet at the pointer, or the one the keyboard is on,
// grows most and its neighbours less by their distance, each easing there frame by frame, and no frame is asked once all stand still. As a
// dock's, distances are read on the column at rest, measured while nothing is grown, and the column shifts so the pointed planet stays
// under the pointer. Never under reduced motion, nor for a finger or where nothing hovers, a touch screen.

/** How much the planet at the pointer grows, and how far from it, in pixels, its neighbours still do. */
export const MAGNIFIED = 1.55;
export const REACH = 230;
const EASE = 0.2;
const STILL = 0.002;
// Less than this, a planet's size has stopped changing: what the page reads back wavers below it.
const STEADY = 1e-4;
// Less than this, in pixels, the column has stopped moving.
const SETTLED = 0.05;
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

// The links at rest, read while nothing is grown and the list stands unshifted.
function restOf(list: HTMLElement, links: readonly HTMLElement[]): Rest[] {
  const top = list.getBoundingClientRect().top;
  return links.map((link) => {
    const box = link.getBoundingClientRect();
    return {
      offset: box.top - top,
      height: box.height,
      planet: link.firstElementChild?.getBoundingClientRect().height ?? 0,
    };
  });
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

// The column as a frame reads it: its links, each at rest, and the list's top as if it stood unshifted, which moves with its scroll.
interface Column {
  readonly links: readonly HTMLElement[];
  readonly rests: readonly Rest[];
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
    const eased = Math.abs(target - now) < STILL ? target : now + (target - now) * EASE;
    const next = Math.abs(eased - now) < STEADY ? now : eased;
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
  const sizes = new WeakMap<Element, number>();
  let column: Column = { links: [], rests: [], top: 0 };
  let pointer: number | undefined;
  let focused: Element | undefined;
  // The place the column holds still: the last one aimed at, while the planets shrink back.
  let [anchor, shift, frame] = [0, 0, 0];
  // The links at rest, measured again while nothing is grown, or once the list holds other links.
  const read = (): Column => {
    const links = [...list.querySelectorAll<HTMLElement>("li > a")];
    const still = links.every((link) => (sizes.get(link) ?? 1) === 1) && shift === 0;
    const same = links.length === column.links.length && links.every((link, at) => link === column.links[at]);
    const rests = still || !same ? restOf(list, links) : column.rests;
    return { links, rests, top: list.getBoundingClientRect().top + shift };
  };
  const step = () => {
    frame = 0;
    column = read();
    const { rests, top } = column;
    const focus = rests[column.links.findIndex((link) => link === focused)];
    const at = matchMedia(QUIET).matches ? undefined : (pointer ?? (focus && top + focus.offset + focus.height / 2));
    let moving = grow(column, sizes, at);
    anchor = at ?? anchor;
    const next = shift + driftOf(column, anchor);
    moving ||= Math.abs(next - shift) >= SETTLED;
    // The shift as written, in hundredths of a pixel: the top read back next frame is the page's, not a rounding of it.
    shift = Math.abs(next) < SETTLED ? 0 : Math.round(next * 100) / 100;
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
