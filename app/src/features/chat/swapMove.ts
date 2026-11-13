// The chat's move to another place's room in place (Alexis, 2026-11-10: "les transitions vers le chat selon les mondes"): the same screen
// stays, the room it leaves is a still copy over it that fades out as the next one stands under, so nothing changes in one frame.
// Nothing moves under reduced motion.
import { gsap } from "gsap";
import { useLayoutEffect, type RefObject } from "react";
import { motionOf } from "../../space/motion.ts";
import { restoreScrolls, takeLeft } from "./stillScreen.ts";

const FADE_S = 0.5;

/** Fades out, over the live `screenRef`, the still copy of the room the chat left, once the screen shows the place `key`. A next move, or the
 * screen going, takes the copy and its tween away. */
export function useSwapMove(screenRef: RefObject<HTMLElement | null>, key: string): void {
  useLayoutEffect(() => {
    const screen = screenRef.current;
    const was = takeLeft(key);
    if (screen === null || was === undefined || motionOf().matches) return;
    const { copy } = was;
    const live: HTMLElement = screen;
    // The copy covers the screen's box in place, so a screen still arriving carries it along.
    const unplaced = getComputedStyle(screen).position === "static";
    if (unplaced) screen.style.position = "relative";
    copy.style.cssText +=
      ";position:absolute;inset:0;margin:0;z-index:2;pointer-events:none;animation:none;transition:none;opacity:1";
    screen.append(copy);
    restoreScrolls(copy, was.scrolls);
    const fade = gsap.to(copy, { autoAlpha: 0, duration: FADE_S, ease: "power1.out", onComplete: end });
    function end(): void {
      fade.kill();
      copy.remove();
      if (unplaced) live.style.position = "";
    }
    return end;
  }, [screenRef, key]);
}
