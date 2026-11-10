// The aiming tags' arrival (D411): they wait out of sight while a flight runs, and come as a page's words do once it has landed.
import { gsap } from "gsap";
import { motionOf } from "../../space/motion.ts";
import { all, EMPHASIZED, LABEL_MS, MOVED, OUT4, WORDS } from "./arrivalBase.ts";

const TAGS = "[data-tag]";
// A label's fade, in and out: 0.4 s on the app's in-out curve (tokens.css's --motion-label and --ease-emphasized, which GSAP cannot read).
const FADE = LABEL_MS / 1000;
// Whether the flight has landed: the tags that aim at the planet (data-tag) wait out of sight till then, and come as the page's words do.
let landed = false;

// The aiming tags rise as a page does (D411): the panel's ground first, then its title, then the rest of its lines 0.05 s apart.
function tagsIn(root: ParentNode): gsap.core.Timeline {
  const timeline = gsap.timeline();
  const end = { clearProps: MOVED };
  timeline.fromTo(all(root, TAGS), { autoAlpha: 0 }, { autoAlpha: 1, duration: FADE, ease: EMPHASIZED, ...end }, 0);
  timeline.fromTo(
    all(root, `${TAGS} b`),
    { yPercent: 40, autoAlpha: 0 },
    { yPercent: 0, autoAlpha: 1, duration: 1.1, ease: OUT4, ...end },
    WORDS,
  );
  timeline.fromTo(
    all(root, `${TAGS} span`),
    { y: 18, autoAlpha: 0 },
    { y: 0, autoAlpha: 1, duration: 0.7, ease: "power3.out", ...end },
    WORDS + 0.15,
  );
  return timeline;
}

/** A flight begins: the aiming tags fade out (from where they stand) and wait out of sight (never over the galaxy it flies through) till it
 * lands; at once under reduced motion. */
export function waitTags(): void {
  landed = false;
  const parts = all(document, `${TAGS}, ${TAGS} h2, ${TAGS} p`);
  gsap.killTweensOf(parts);
  gsap.set(all(document, `${TAGS} h2, ${TAGS} p`), { clearProps: "transform,opacity" });
  const tags = all(document, TAGS);
  if (motionOf().matches) gsap.set(tags, { autoAlpha: 0 });
  else gsap.to(tags, { autoAlpha: 0, duration: FADE, ease: EMPHASIZED, overwrite: true });
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
