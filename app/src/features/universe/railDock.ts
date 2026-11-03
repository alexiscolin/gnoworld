// The rail's dock (ADR-0002 §1's rail, "magnified like a dock under the pointer"): the planet at the pointer, or the one the keyboard is on,
// grows most and its neighbours less by their distance, each easing there frame by frame, and no frame is asked once all stand still. As a
// dock's, distances are read on the column at rest and the column shifts so the place under the pointer stays under it: the planets above
// grow upward, those below downward. Never under reduced motion, nor where nothing hovers, a touch screen.

/** How much the planet at the pointer grows, and how far from it, in pixels, its neighbours still do. */
export const MAGNIFIED = 1.55;
export const REACH = 230;
const EASE = 0.2;
const STILL = 0.002;
const QUIET = "(prefers-reduced-motion: reduce), (pointer: coarse)";

// How much a planet `distance` pixels from the pointer grows: the most at it, smoothly none from `REACH` on.
const magnifiedAt = (distance: number): number =>
  distance >= REACH ? 1 : 1 + ((MAGNIFIED - 1) * (1 + Math.cos((Math.PI * distance) / REACH))) / 2;

// A link at rest: its top and height as if no planet had grown nor the column shifted, and its planet's own size.
interface Rest {
  readonly top: number;
  readonly height: number;
  readonly planet: number;
}

// The column's links at rest, read off the page, which shows them shifted up by `shift`: a link's growth is its planet's, its planet's box
// over its magnification.
function restOf(links: readonly HTMLElement[], sizes: WeakMap<Element, number>, shift: number): Rest[] {
  let grown = 0;
  return links.map((link) => {
    const { top, height } = link.getBoundingClientRect();
    const magnified = sizes.get(link) ?? 1;
    const planet = (link.firstElementChild?.getBoundingClientRect().width ?? 0) / magnified;
    const growth = planet * (magnified - 1);
    const rest = { top: top + shift - grown, height: height - growth, planet };
    grown += growth;
    return rest;
  });
}

// How far the column shifts up so the place `at` holds at rest stays under it: the growth above it, and its share of its own link's.
function shiftFor(rests: readonly Rest[], sizes: readonly number[], at: number): number {
  let shift = 0;
  for (const [index, { top, height, planet }] of rests.entries()) {
    const growth = planet * ((sizes[index] ?? 1) - 1);
    if (at < top) break;
    shift += at < top + height ? (growth * (at - top)) / height : growth;
  }
  return shift;
}

interface Column {
  readonly rests: readonly Rest[];
  readonly sizes: WeakMap<Element, number>;
}

// Each link's next magnification, eased toward its target from the place `at` on the column at rest; all at rest with none.
function eased(links: readonly HTMLElement[], { rests, sizes }: Column, at: number | undefined) {
  return links.map((link, index) => {
    const rest = rests[index];
    const target = at === undefined || rest === undefined ? 1 : magnifiedAt(Math.abs(at - rest.top - rest.height / 2));
    const now = sizes.get(link) ?? 1;
    return Math.abs(target - now) < STILL ? target : now + (target - now) * EASE;
  });
}

/** Grows the planets of `list`'s links, each by the `--_mag` written on it (ui's PlanetThumb), and shifts the list as a dock's, until
 * `signal` ends. */
export function dock(list: HTMLElement, signal: AbortSignal): void {
  const sizes = new WeakMap<Element, number>();
  let pointer: number | undefined;
  let focused: Element | undefined;
  // The place the column holds still: the last one aimed at, while the planets shrink back.
  let [anchor, shift, frame] = [0, 0, 0];
  const step = () => {
    frame = 0;
    const links = [...list.querySelectorAll<HTMLElement>("li > a")];
    const rests = restOf(links, sizes, shift);
    const focus = rests[links.findIndex((link) => link === focused)];
    const at = matchMedia(QUIET).matches ? undefined : (pointer ?? (focus && focus.top + focus.height / 2));
    const next = eased(links, { rests, sizes }, at);
    const moving = links.some((link, index) => next[index] !== (sizes.get(link) ?? 1));
    for (const [index, link] of links.entries()) {
      sizes.set(link, next[index] ?? 1);
      if (link.firstElementChild instanceof HTMLElement)
        link.firstElementChild.style.setProperty("--_mag", (next[index] ?? 1).toFixed(4));
    }
    anchor = at ?? anchor;
    shift = shiftFor(rests, next, anchor);
    list.style.setProperty("translate", `0 ${(-shift).toFixed(2)}px`);
    if (moving) frame = requestAnimationFrame(step);
  };
  const aim = () => {
    frame ||= requestAnimationFrame(step);
  };
  const on = { signal };
  list.addEventListener(
    "pointermove",
    ({ clientY }) => {
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
  signal.addEventListener("abort", () => {
    cancelAnimationFrame(frame);
  });
}
