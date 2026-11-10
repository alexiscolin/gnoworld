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
