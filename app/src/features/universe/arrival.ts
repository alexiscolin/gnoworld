// A page's arrival and leaving (D401, the dive's demo; the video's frames 19 and 20), with GSAP on the design system's own panel: first the
// grounds, the plate's fill (space's own, frame.ts, on a page with a planet) and frame and the chat's panel; once they stand, the words:
// the kicker, the title and the first screen's lines rise as the proposal's score has them (the plate's blocks play theirs in their own sheets), the chat's lines rise. It starts as the flight
// nears its end, or at once on a page opened directly. Leaving plays the same back, 2.6 times as fast, on the page's ghost. Nothing moves
// under reduced motion.
import { gsap } from "gsap";
import { all, MOVED, OUT4, WORDS } from "./arrivalBase.ts";
import { holdsShell, revealShell } from "./firstLook.ts";
import { motionOf } from "../../space/motion.ts";

const PLATE = "[data-look='plate']";
// What the first screen holds besides the title and the kicker, which have steps of their own: the lede and the banners. The plate's blocks (its
// root is [data-blocks]) come after it, with the entrance their own sheets play (the proposal's score).
const ITEMS = "[data-content] > div > div > div > :not([data-title], [data-planet], [data-blocks])";
// The dock is what leaves with the page and holds no plate; on a leaving page's ghost, its copy.
const DOCK = ":not(:has([data-look='plate']))";
// The chat's parts as the demo's: its header, the lines in view (it stands at its end: the last ten) and what follows them. A chat that stood
// through the move from the page before (`data-stood`, fullHost.tsx) keeps its own: it changes in place, never rising again.
const LINES = "ol[aria-label='Messages']";
const SEATED = "[data-chat-seat]:not([data-stood])";
const CHAT = ["header", `${LINES} > li:nth-last-child(-n + 10)`, `${LINES} ~ *`]
  .map((part) => `${SEATED} ${part}`)
  .join(", ");
const BACK = 2.6;

type Vars = gsap.TweenVars;
interface Parts {
  readonly root: ParentNode;
  readonly plate: Element | null;
  /** A leaving page's copy: its blocks, which have entrances of their own sheets, fade as they go. */
  readonly ghost: boolean;
  /** The docks that arrive: none where a flight brought the page, whose dock stood through it (globe.module.css). */
  readonly docks: Element[];
}
// One part of the arrival: what it moves, from what, to what, and when.
interface Step {
  readonly of: (parts: Parts) => Element[];
  readonly from: Vars;
  readonly to: Vars;
  readonly at: number;
  /** Of the box (the plate, its frame and the dock), which stand from the page's first paint; the rest is the words', which wait for the blocks. */
  readonly box?: true;
}

const STEPS: readonly Step[] = [
  {
    of: ({ plate }) => (plate === null ? [] : [plate]),
    from: { "--plate-in": 0, autoAlpha: 0 },
    to: { "--plate-in": 1, autoAlpha: 1, duration: 0.5, ease: "power2.out" },
    at: 0,
    box: true,
  },
  {
    of: ({ root }) => all(root, "[data-frame], [data-caption]"),
    from: { autoAlpha: 0 },
    to: { autoAlpha: 1, duration: 0.6, ease: "power1.out" },
    at: 0,
    box: true,
  },
  {
    of: ({ docks }) => docks,
    from: { x: 28, autoAlpha: 0 },
    to: { x: 0, autoAlpha: 1, duration: 0.7, ease: "power3.out" },
    at: 0,
    box: true,
  },
  // The plate's own score (the proposal's): the kicker rises 12 px over 0.6 s at once; the title rises out of its clip from 40 % below over 1.1 s from
  // 0.1 s, its opacity done at 45 % of it; the lede and the other lines of the first screen rise 16 px over 0.7 s from 0.35 s. The plate's blocks play
  // theirs in their own sheets.
  {
    of: ({ plate }) => all(plate, "[data-planet]"),
    from: { y: 12, autoAlpha: 0 },
    to: { y: 0, autoAlpha: 1, duration: 0.6, ease: "power3.out" },
    at: 0,
  },
  {
    of: ({ plate }) => all(plate, "h1"),
    from: { yPercent: 40 },
    to: { yPercent: 0, duration: 1.1, ease: OUT4 },
    at: 0.1,
  },
  {
    of: ({ plate }) => all(plate, "h1"),
    from: { autoAlpha: 0 },
    to: { autoAlpha: 1, duration: 0.5, ease: OUT4 },
    at: 0.1,
  },
  {
    of: ({ plate }) => all(plate, ITEMS),
    from: { y: 16, autoAlpha: 0 },
    to: { y: 0, autoAlpha: 1, duration: 0.7, ease: "power3.out" },
    at: 0.35,
  },
  // The plate's blocks leave with the rest (a ghost only: they come by their own sheets): never standing whole while the title is gone.
  {
    of: ({ plate, ghost }) => (ghost ? all(plate, "[data-blocks]") : []),
    from: { autoAlpha: 0 },
    to: { autoAlpha: 1, duration: 0.6, ease: "power1.out" },
    at: 0.35,
  },
  {
    of: ({ docks }) => docks.flatMap((dock) => all(dock, CHAT)),
    from: { y: 12, autoAlpha: 0 },
    to: { y: 0, autoAlpha: 1, duration: 0.5, stagger: 0.04, ease: "power3.out" },
    at: WORDS + 0.1,
  },
];

let running: gsap.core.Timeline | undefined;
// A page whose plate comes after it lays out (its chat's door, its route's code: the plate popped in whole, Alexis, 2026-11-10) waits for
// it, a few seconds at most, then plays; `waiting` stops that wait when another page comes or this one leaves.
const PLATE_WAIT_MS = 6000;
// The scene that is not sharp within this is shown as it is (frame.ts); the arrival waits for it a little longer, then plays.
const SCENE_WAIT_MS = 5000;
let waiting: (() => void) | undefined;

/** The cosmos's own parts, in the order they rise (rise.ts): the header, the hero, the worlds' list or the rail. They stay as
 * space's flights come and go between the galaxy and a system, so a page's arrival leaves them be: they rise once, as they come (Alexis,
 * 2026-11-09: "comme un double chargement"); they leave with their page's ghost as any part does. */
export const RISING = ["header", "[data-clear]", "nav[aria-label='Worlds']"];
const STAYING = `:not(${RISING.join(", ")})`;

// The docks that arrive under `root`: a leaving page's copies (`ghost`), or the page's own but the cosmos's, which stay.
const docksOf = (root: ParentNode, ghost: boolean): Element[] =>
  ghost ? all(root, `[data-ghost]${DOCK}`) : all(root, `[data-exit]${DOCK}${STAYING}`);

/** The arrival of the page under `root` (a leaving page's `ghost`, its copied parts): a timeline, played once; `part` plays only the box (the
 * plate, frame and dock, from the first paint) or only the words (once the blocks stand), both on a ghost. A page a flight brought keeps its dock
 * as it stood through the flight (`flown`): the chat shows from the flight's start, never popping in at its end. */
function arrivalOf(
  root: ParentNode,
  { ghost = false, flown = false, part }: { ghost?: boolean; flown?: boolean; part?: "box" | "words" } = {},
): gsap.core.Timeline {
  const plate = root.querySelector(ghost ? PLATE : `${PLATE}:not([data-ghost] *)`);
  const parts: Parts = { root, plate, ghost, docks: flown ? [] : docksOf(root, ghost) };
  const timeline = gsap.timeline();
  if (part === "words") document.documentElement.dataset["arrivedAt"] = String(performance.now());
  for (const { of, from, to, at } of STEPS.filter(
    ({ box }) => part === undefined || (part === "box") === (box === true),
  )) {
    const targets = of(parts);
    if (targets.length > 0) timeline.fromTo(targets, from, ghost ? to : { ...to, clearProps: MOVED }, at);
  }
  return timeline;
}

export { enterTag, landTags, waitTags } from "./tags.ts";

// The plate's blocks (its route asks them as a chunk once the door to space has come, with the chat) stand: the whole plate has come.
const blocksPresent = (): boolean => document.querySelector(`${PLATE}:not([data-ghost] *) [data-blocks]`) !== null;
// What the words hold that the plate's shapes stand in for: the kicker, the title and the first screen's lines.
const unseen = (): Element[] => {
  const plate = document.querySelector(`${PLATE}:not([data-ghost] *)`);
  return [...all(plate, "[data-planet], h1"), ...all(plate, ITEMS)];
};
let arrived = false;
// Which page is on screen: it counts up as a page begins, and a leaving page's ghost acts only on the arrival of its own.
let generation = 0;

/** The page now on screen, to tell it from the one that follows it. */
export const pageNow = (): number => generation;

// The page begun last and when: a development build's strict second run of its effects begins the same page again at once.
let begun: { key: string; at: number } | undefined;
const SAME_RUN_MS = 50;

/** A page begins (its hold on space), `key` its place: its arrival is still to play, once. The same page begun again in the same breath
 * (React's strict second run) keeps the arrival it has, never restarting it from nothing. */
export function newPage(key: string): void {
  const at = performance.now();
  const again = begun?.key === key && at - begun.at < SAME_RUN_MS;
  begun = { key, at };
  if (again) return;
  generation += 1;
  arrived = false;
  for (const key of ["arrive", "arrivedAt"]) Reflect.deleteProperty(document.documentElement.dataset, key);
  // The plate's cards count from this page's first (Card/useRise.ts): a scroller that outlives a page starts the count again.
  document.querySelector("[data-content]")?.removeAttribute("data-rise");
}

// Calls `go` once `ready()` holds (looked at as the page changes), or after `within` ms; `waiting` stops it when another page comes or this one
// leaves.
function waitFor(ready: () => boolean, go: () => void, within: number): void {
  const observer = new MutationObserver(() => {
    if (ready()) arrive();
  });
  const timer = setTimeout(() => {
    arrive();
  }, within);
  const stop = (): void => {
    observer.disconnect();
    clearTimeout(timer);
    waiting = undefined;
  };
  const arrive = (): void => {
    stop();
    go();
  };
  waiting = stop;
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-sharp"],
  });
}

/** Plays the page's arrival, the flight bringing it near its end or none bringing it. The box (the plate's fill, its frame and the dock) comes
 * at once; the words (title, lines, blocks, chat) play once the plate's blocks stand, on one clock. Nothing stands alone, no edge shows before its box. */
export function enterPage(flown = false, stays = false): void {
  // One arrival to a page: the flight's own calls (it nears, it lands) come after the page's and never play it again.
  if (arrived) return;
  arrived = true;
  waiting?.();
  running?.progress(1).kill();
  const reduced = motionOf().matches;
  // A page of the kind that left (`stays`: a world after a world) finds the plate, its frame and the dock standing: they stay as they are, and
  // only the words change (their own step below), never the box played again from nothing.
  const box = playsBox(reduced, stays) ? arrivalOf(document, { flown, part: "box" }) : undefined;
  running = box;
  const words = (): void => {
    if (!reduced) running = arrivalOf(document, { flown, part: "words" });
  };
  const begin = (): void => {
    delete document.documentElement.dataset["arrive"];
    revealShell(false);
    box?.play();
    wordsWhenBlocks(words, reduced);
  };
  // A page opened from its URL: its box (set out of sight just now), the header and the scene wait for the scene's planet to be itself, then
  // come in together; the words follow once the blocks stand.
  if (!reduced && holdsShell()) {
    box?.pause();
    document.documentElement.dataset["arrive"] = "wait";
    waitFor(() => !holdsShell(), begin, SCENE_WAIT_MS);
  } else begin();
}

// The box plays unless motion is reduced or the page's kind stayed.
const playsBox = (reduced: boolean, stays: boolean): boolean => !reduced && !stays;

// The words play at once where no plate waits for its blocks; else they wait out of sight (drawn by no one) until the blocks come (asked once
// the page has loaded), and the whole plate enters together.
function wordsWhenBlocks(words: () => void, reduced: boolean): void {
  const plate = document.querySelector(`${PLATE}:not([data-ghost] *)`);
  if (plate === null || blocksPresent() || reduced) {
    words();
    return;
  }
  for (const part of unseen()) gsap.set(part, { autoAlpha: 0 });
  waitFor(blocksPresent, words, PLATE_WAIT_MS);
}

/** The page's copies in `layer` play the arrival back, 2.6 times as fast, and the layer goes with the end. */
export function leavePage(layer: HTMLElement, page: number): void {
  // A page that has begun since (no flight between them: a phone, a weak GPU) owns the arrival now: the leaving one's copies play back alone.
  // Else its own arrival ends where it stands (never left half drawn on parts that persist, as the chat's seat does).
  if (page === generation) {
    waiting?.();
    running?.progress(1).kill();
    running = undefined;
  }
  const back = arrivalOf(layer, { ghost: true });
  back.progress(1).timeScale(BACK).reverse();
  back.eventCallback("onReverseComplete", () => {
    layer.remove();
  });
}
