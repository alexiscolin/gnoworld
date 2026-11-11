// The chat's move between its dock and the full screen (Alexis, 2026-11-08, "une bonne transition entre les deux modes"): opening, the
// full chat grows out of the dock's box over the page, which fades out under it; closing, a still copy of it shrinks back into the dock's
// box as the page comes back in, and goes. Nothing moves under reduced motion.
import { gsap } from "gsap";
import { useLayoutEffect, type RefObject } from "react";
import { FULL_MOVE, takeBack, takeDock } from "../../fullChat.ts";
import { motionOf } from "../../space/motion.ts";
import { fadeFrames, growFrames, insetsOf, parseInset, shrinkFrames, type Insets } from "./moveClip.ts";
import { restoreScrolls, stillFull, takeClosing } from "./stillScreen.ts";

// Space's flights' own curve, a cubic in and out (space/rig/flight.ts's inOut), a little longer than before: the chat eases off and lands
// as a flight does (Alexis, 2026-11-09: "plus smooth à la fin et au début … en cohérence avec … les planètes").
const EASE = FULL_MOVE.ease;
const GROW_S = FULL_MOVE.duration;
const SHRINK_S = 0.8;
const FADE_S = 0.3;
// The grow's clip carries on this long past the box, out of the corners' sight, so the edge lands on its curve's own end.
const TAIL_S = 0.06;
// raw: the dock's corners, the outline's
const ROUND = 16;
const NONE: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

const grows = new WeakMap<HTMLElement, Animation[]>();
const LINEAR = "linear";
const ease = gsap.parseEase;

// The full chat's `screen`, just laid out: grows out of the dock's box, fading in over the dock's ghost (rise.ts), which fades out under it.
// Web Animations: the browser runs the clip and the opacity on its compositor, so busy script never drops a frame of the grow (D13980).
function growFull(screen: HTMLElement): void {
  const from = takeDock();
  if (from === undefined || motionOf().matches) return;
  const box = screen.getBoundingClientRect();
  try {
    const moves = [
      screen.animate(growFrames(box, from, { round: ROUND, curve: ease(EASE), grow: GROW_S, tail: TAIL_S }), {
        duration: (GROW_S + TAIL_S) * 1000,
        easing: LINEAR,
      }),
      screen.animate(fadeFrames(ease("power1.out"), 0, 1), { duration: FADE_S * 1000, easing: LINEAR }),
    ];
    grows.set(screen, moves);
  } catch (error) {
    reportError(error);
  }
}

// Where the grow stands on the screen, if it runs: its clip and opacity as shown, its moves cancelled, so the screen is itself again.
function stopGrow(screen: HTMLElement): { insets: Insets; opacity: number } | undefined {
  const moves = grows.get(screen);
  grows.delete(screen);
  if (moves === undefined) return undefined;
  const running = moves.some((move) => move.playState === "running");
  const look = getComputedStyle(screen);
  const shown = running
    ? { insets: parseInset(look.clipPath) ?? NONE, opacity: Number.parseFloat(look.opacity) }
    : undefined;
  for (const move of moves) move.cancel();
  return shown;
}

// The full chat's `screen`, going: a still copy of it (taken before the commit changed it, stillScreen.ts, else now) shrinks into the dock the
// page lays out, or fades where there is none; from where the grow stood, when it was cut short.
function shrinkFull(screen: HTMLElement): void {
  const shown = stopGrow(screen);
  if (motionOf().matches) return;
  const still = takeClosing() ?? stillFull(screen);
  if (still === undefined) return;
  const { copy, box } = still;
  document.body.append(copy);
  restoreScrolls(copy, still.scrolls);
  // The page that takes the chat back lays its dock out in the frame after.
  requestAnimationFrame(() => {
    try {
      const to = takeBack();
      const opacity = shown?.opacity ?? 1;
      const going = [
        copy.animate(fadeFrames(ease("power1.in"), opacity, 0), {
          duration: FADE_S * 1000,
          delay: (to === undefined ? 0 : SHRINK_S - FADE_S) * 1000,
          easing: LINEAR,
          fill: "forwards",
        }),
      ];
      if (to !== undefined) {
        const end = insetsOf(box, to);
        going.push(
          copy.animate(shrinkFrames(shown?.insets ?? NONE, end, { round: ROUND, curve: ease(EASE) }), {
            duration: SHRINK_S * 1000,
            easing: LINEAR,
            fill: "forwards",
          }),
        );
      }
      Promise.allSettled(going.map((move) => move.finished)).then(() => {
        copy.remove();
      }, reportError);
    } catch (error) {
      copy.remove();
      reportError(error);
    }
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
