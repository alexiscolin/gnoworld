// A page's arrival and leaving (D401, the dive's demo; the video's frames 19 and 20), with GSAP on the design system's own panel: first the
// grounds, the plate's fill (space's own, frame.ts, on a page with a planet) and frame and the chat's panel; once they stand, the words:
// the title rises from 40 % below, the rest follows 0.05 s apart, the activity bars grow, the chat's lines rise. It starts as the flight
// nears its end, or at once on a page opened directly. Leaving plays the same back, 2.6 times as fast, on the page's ghost. Nothing moves
// under reduced motion.
import { gsap } from "gsap";
import { motionOf } from "../../space/motion.ts";

const PLATE = "[data-look='plate']";
const ITEMS = "[data-content] > div > div > div > :not(h1)";
// The dock is what leaves with the page and holds no plate; on a leaving page's ghost, its copy.
const DOCK = ":not(:has([data-look='plate']))";
// The chat's parts as the demo's: its header, the lines in view (it stands at its end: the last ten) and what follows them.
const LINES = "ol[aria-label='Messages']";
const CHAT = `header, ${LINES} > li:nth-last-child(-n + 10), ${LINES} ~ *`;
const BACK = 2.6;
// When the words start: the plate's fill, the frame and the chat's panel stand by then (space's plate is nearly whole at 0.35 s).
const WORDS = 0.3;
// What a step leaves inline once it ends: none, so a moved part is no containing block for what its menus fix in place.
const MOVED = "transform,opacity,visibility";

type Vars = gsap.TweenVars;
interface Parts {
  readonly root: ParentNode;
  readonly plate: Element | null;
  /** The docks that arrive: none where a flight brought the page, whose dock stood through it (globe.module.css). */
  readonly docks: Element[];
}
// One part of the arrival: what it moves, from what, to what, and when.
interface Step {
  readonly of: (parts: Parts) => Element[];
  readonly from: Vars;
  readonly to: Vars;
  readonly at: number;
}

const all = (root: ParentNode | null, selector: string): Element[] =>
  root === null ? [] : [...root.querySelectorAll(selector)];

const STEPS: readonly Step[] = [
  {
    of: ({ plate }) => (plate === null ? [] : [plate]),
    from: { "--plate-in": 0 },
    to: { "--plate-in": 1, duration: 0.5, ease: "power2.out" },
    at: 0,
  },
  {
    of: ({ root }) => all(root, "[data-frame], [data-caption]"),
    from: { autoAlpha: 0 },
    to: { autoAlpha: 1, duration: 0.6, ease: "power1.out" },
    at: 0,
  },
  {
    of: ({ docks }) => docks,
    from: { x: 28, autoAlpha: 0 },
    to: { x: 0, autoAlpha: 1, duration: 0.7, ease: "power3.out" },
    at: 0,
  },
  {
    of: ({ plate }) => all(plate, "h1"),
    from: { yPercent: 40, autoAlpha: 0 },
    to: { yPercent: 0, autoAlpha: 1, duration: 1.1, ease: "power4.out" },
    at: WORDS,
  },
  {
    of: ({ plate }) => all(plate, ITEMS),
    from: { y: 18, autoAlpha: 0 },
    to: { y: 0, autoAlpha: 1, duration: 0.7, stagger: 0.05, ease: "power3.out" },
    at: WORDS + 0.15,
  },
  {
    of: ({ docks }) => docks.flatMap((dock) => all(dock, CHAT)),
    from: { y: 12, autoAlpha: 0 },
    to: { y: 0, autoAlpha: 1, duration: 0.5, stagger: 0.04, ease: "power3.out" },
    at: WORDS + 0.1,
  },
  {
    of: ({ plate }) => all(plate, "svg rect"),
    from: { scaleY: 0 },
    to: { scaleY: 1, transformOrigin: "50% 100%", duration: 0.6, stagger: 0.01, ease: "power2.out" },
    at: WORDS + 0.3,
  },
];

let running: gsap.core.Timeline | undefined;
// A page whose plate comes after it lays out (its chat's door, its route's code: the plate popped in whole, Alexis, 2026-11-10) waits for
// it, a few seconds at most, then plays; `waiting` stops that wait when another page comes or this one leaves.
const PLATE_WAIT_MS = 6000;
let waiting: (() => void) | undefined;
// Whether the flight has landed: the tags that aim at the planet (data-tag) wait out of sight till then, and come as the page's words do.
let landed = false;

/** The cosmos's own parts, in the order they rise (rise.ts): the header, the hero, the worlds' list or the rail. They stay as
 * space's flights come and go between the galaxy and a system, so a page's arrival leaves them be: they rise once, as they come (Alexis,
 * 2026-11-09: "comme un double chargement"); they leave with their page's ghost as any part does. */
export const RISING = ["header", "[data-clear]", "nav[aria-label='Worlds']"];
const STAYING = `:not(${RISING.join(", ")})`;

// The docks that arrive under `root`: a leaving page's copies (`ghost`), or the page's own but the cosmos's, which stay.
const docksOf = (root: ParentNode, ghost: boolean): Element[] =>
  ghost ? all(root, `[data-ghost]${DOCK}`) : all(root, `[data-exit]${DOCK}${STAYING}`);

/** The arrival of the page under `root` (a leaving page's `ghost`, its copied parts): a timeline, played once. A page a flight brought
 * keeps its dock as it stood through the flight (`flown`): the chat shows from the flight's start, never popping in at its end. */
function arrivalOf(
  root: ParentNode,
  { ghost = false, flown = false }: { ghost?: boolean; flown?: boolean } = {},
): gsap.core.Timeline {
  const plate = root.querySelector(ghost ? PLATE : `${PLATE}:not([data-ghost] *)`);
  const parts: Parts = { root, plate, docks: flown ? [] : docksOf(root, ghost) };
  const timeline = gsap.timeline();
  for (const { of, from, to, at } of STEPS) {
    const targets = of(parts);
    if (targets.length > 0) timeline.fromTo(targets, from, ghost ? to : { ...to, clearProps: MOVED }, at);
  }
  return timeline;
}

const TAGS = "[data-tag]";

// The aiming tags rise as a page does (D411): the panel's ground first, then its title, then the rest of its lines 0.05 s apart.
function tagsIn(root: ParentNode): gsap.core.Timeline {
  const timeline = gsap.timeline();
  const [title, line] = [STEPS[3], STEPS[4]];
  const end = { clearProps: MOVED };
  timeline.fromTo(all(root, TAGS), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6, ease: "power1.out", ...end }, 0);
  if (title !== undefined) timeline.fromTo(all(root, `${TAGS} b`), title.from, { ...title.to, ...end }, WORDS);
  if (line !== undefined) timeline.fromTo(all(root, `${TAGS} span`), line.from, { ...line.to, ...end }, WORDS + 0.15);
  return timeline;
}

/** A flight begins: the aiming tags wait out of sight (never over the galaxy it flies through) till it lands. */
export function waitTags(): void {
  landed = false;
  const parts = all(document, `${TAGS}, ${TAGS} h2, ${TAGS} p`);
  gsap.killTweensOf(parts);
  gsap.set(all(document, TAGS), { autoAlpha: 0 });
  gsap.set(parts, { clearProps: "transform,opacity" });
}

/** A tag that stands once the page has landed rises at once if the flight is over; else it waits for `enterPage`. Never moves under
 * reduced motion, where it shows as it stands. */
export function enterTag(tag: Element): void {
  gsap.set(tag, { autoAlpha: 0 });
  if (!landed) return;
  if (motionOf().matches) gsap.set(tag, { autoAlpha: 1 });
  else tagsIn(tag.parentElement ?? document);
}

/** The flight has landed, the planet in its frame: the aiming tags rise, as a page's words do (D411), never before. */
export function landTags(): void {
  landed = true;
  if (motionOf().matches) gsap.set(all(document, TAGS), { autoAlpha: 1 });
  else tagsIn(document);
}

const platePresent = (): boolean => document.querySelector(`${PLATE}:not([data-ghost] *)`) !== null;

/** Plays the page's arrival, the flight bringing it near its end or none bringing it. A page that has a plate (`plated`) and lays out
 * before it plays as its plate comes, in the frame it comes in: its fill and words never stand whole before they rise. */
export function enterPage(flown = false, plated = false): void {
  waiting?.();
  running?.progress(1).kill();
  running = undefined;
  if (motionOf().matches) return;
  if (!plated || platePresent()) {
    running = arrivalOf(document, { flown });
    return;
  }
  const arrive = (): void => {
    stop();
    running = arrivalOf(document, { flown });
  };
  const observer = new MutationObserver(() => {
    if (platePresent()) arrive();
  });
  const timer = setTimeout(arrive, PLATE_WAIT_MS);
  const stop = (): void => {
    observer.disconnect();
    clearTimeout(timer);
    waiting = undefined;
  };
  waiting = stop;
  observer.observe(document.body, { childList: true, subtree: true });
}

/** The page's copies in `layer` play the arrival back, 2.6 times as fast, and the layer goes with the end. */
export function leavePage(layer: HTMLElement): void {
  waiting?.();
  running?.kill();
  running = undefined;
  const back = arrivalOf(layer, { ghost: true });
  back.progress(1).timeScale(BACK).reverse();
  back.eventCallback("onReverseComplete", () => {
    layer.remove();
  });
}
