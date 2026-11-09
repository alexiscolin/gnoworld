// The chat's move between its dock and the full screen (Alexis, 2026-11-08, "une bonne transition entre les deux modes"): opening, the
// full chat grows out of the dock's box over the page, which fades out under it; closing, a still copy of it shrinks back into the dock's
// box as the page comes back in, and goes. Nothing moves under reduced motion.
import { gsap } from "gsap";
import { useLayoutEffect, type RefObject } from "react";
import { dockBox, FULL_MOVE, takeDock } from "../../fullChat.ts";
import { motionOf } from "../../space/motion.ts";

// Space's flights' own curve, a cubic in and out (space/rig/flight.ts's inOut), a little longer than before: the chat eases off and lands
// as a flight does (Alexis, 2026-11-09: "plus smooth à la fin et au début … en cohérence avec … les planètes").
const EASE = FULL_MOVE.ease;
const GROW_S = FULL_MOVE.duration;
const SHRINK_S = 0.8;
const FADE_S = 0.3;
// raw: the dock's corners, the outline's
const ROUND = 16;
// What the full chat's mark sets for its parts (ChatScreen.module.css), which its copy keeps without the mark.
const KEPT = ["--font-chat", "--chat-head", "--chat-inset"];

// The clip of `box` that shows `within` alone, its corners `round`.
const clipOf = (box: DOMRect, within: DOMRect, round: number) =>
  `inset(${String(within.top - box.top)}px ${String(box.right - within.right)}px ${String(box.bottom - within.bottom)}px ${String(within.left - box.left)}px round ${String(round)}px)`;

// The full chat's `screen`, just laid out: grows out of the dock's box, when it opened from one, fading in over the dock's ghost
// (rise.ts), which fades out under it: the dock's lines never give way at once to the full chat's columns (Alexis, 2026-11-09, "ça junk").
function growFull(screen: HTMLElement): void {
  const from = takeDock();
  if (from === undefined || motionOf().matches) return;
  const box = screen.getBoundingClientRect();
  // Its own layer while it grows: the clip changes on a layer drawn once, never a repaint of the whole chat in each frame.
  screen.style.willChange = "clip-path, opacity";
  gsap
    .timeline({
      onComplete: () => {
        screen.style.willChange = "";
      },
    })
    .fromTo(
      screen,
      { clipPath: clipOf(box, from, ROUND) },
      { clipPath: clipOf(box, box, 0), duration: GROW_S, ease: EASE, clearProps: "clipPath" },
      0,
    )
    .fromTo(screen, { opacity: 0 }, { opacity: 1, duration: FADE_S, ease: "power1.out", clearProps: "opacity" }, 0);
}

// The full chat's `screen`, going: a still copy of it shrinks into the dock the page lays out, or fades where there is none.
function shrinkFull(screen: HTMLElement): void {
  const copy = screen.cloneNode(true);
  if (!(copy instanceof HTMLElement) || motionOf().matches) return;
  const box = screen.getBoundingClientRect();
  const look = getComputedStyle(screen);
  // Where its lines stood: a copy starts at the top of every list it holds.
  const scrolled = [...screen.querySelectorAll("*")].flatMap((part, at) =>
    part.scrollTop > 0 ? [[at, part.scrollTop] as const] : [],
  );
  // Its class goes, its mark stays: the copy keeps the full chat's layout under the site's header (ChatScreen.module.css), and stands
  // for no open chat (`.screen[data-full]`).
  copy.className = "";
  copy.inert = true;
  copy.setAttribute("aria-hidden", "true");
  for (const named of copy.querySelectorAll("[id]")) named.removeAttribute("id");
  for (const name of KEPT) copy.style.setProperty(name, look.getPropertyValue(name));
  copy.style.cssText += `;position:fixed;margin:0;z-index:3;pointer-events:none;left:${String(box.left)}px;top:${String(box.top)}px;width:${String(box.width)}px;height:${String(box.height)}px`;
  document.body.append(copy);
  const parts = copy.querySelectorAll("*");
  for (const [at, top] of scrolled) parts[at]?.scrollTo({ top });
  // The page that takes the chat back lays its dock out in the frame after.
  requestAnimationFrame(() => {
    const to = dockBox();
    const going = gsap.timeline({
      onComplete: () => {
        copy.remove();
      },
    });
    if (to !== undefined) going.to(copy, { clipPath: clipOf(box, to, ROUND), duration: SHRINK_S, ease: EASE }, 0);
    going.to(copy, { autoAlpha: 0, duration: FADE_S, ease: "power1.in" }, to === undefined ? 0 : SHRINK_S - FADE_S);
  });
}

/** Moves the chat's screen (`screenRef`) as it goes `full`, and as it comes back to its dock. */
export function useFullMove(screenRef: RefObject<HTMLElement | null>, full: boolean): void {
  useLayoutEffect(() => {
    const screen = screenRef.current;
    if (!full || screen === null) return;
    growFull(screen);
    return () => {
      shrinkFull(screen);
    };
  }, [screenRef, full]);
}
