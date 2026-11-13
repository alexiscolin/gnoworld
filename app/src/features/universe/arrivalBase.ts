// What the arrival and the aiming tags' arrival share: the proposal's own curve for a title (s1.html, --ease-out-4), exactly (GSAP's power4.out is
// another), when the words start, what a step leaves inline, and a query that takes no null.
import { bezier } from "./bezier.ts";

export const OUT4 = bezier([0.23, 1, 0.32, 1]);
// A label's fade, ms (tokens.css's --motion-label: arrivalBase.test.ts holds the two together), and the app's --ease-emphasized (tokens.css), for what fades in or out of the page's own.
export const LABEL_MS = 400;
export const EMPHASIZED = bezier([0.7, 0, 0.2, 1]);
// When the words start: the plate's fill, the frame and the chat's panel stand by then (space's plate is nearly whole at 0.35 s).
export const WORDS = 0.3;
// What a step leaves inline once it ends: none, so a moved part is no containing block for what its menus fix in place.
export const MOVED = "transform,opacity,visibility";

export const all = (root: ParentNode | null, selector: string): Element[] =>
  root === null ? [] : [...root.querySelectorAll(selector)];

// The chat's parts as the demo's: its header, the lines in view (it stands at its end: the last ten) and what follows them. A chat that stood
// through the move from the page before (`data-stood`, fullHost.tsx) keeps its own: it changes in place, never rising again.
const LINES = "ol[aria-label='Messages']";
const SEATED = "[data-chat-seat]:not([data-stood])";
export const CHAT = ["header", `${LINES} > li:nth-last-child(-n + 10)`, `${LINES} ~ *`]
  .map((part) => `${SEATED} ${part}`)
  .join(", ");

// What the first screen holds besides the title and the kicker, which have steps of their own: the lede and the banners. The plate's blocks (its
// root is [data-blocks]) come after it, with the entrance their own sheets play (the proposal's score).
export const ITEMS = "[data-content] > div > div > div > :not([data-title], [data-planet], [data-blocks])";

// The dock is what leaves with the page and holds no plate; on a leaving page's ghost, its copy.
export const DOCK = ":not(:has([data-look='plate']))";
