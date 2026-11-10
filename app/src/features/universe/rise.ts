// What rises in as the cosmos opens, from a step below, one after the other (the first load's one clock, SpaceLoader.tsx; a return from a
// page's flight, routes/home.tsx and the rail), and what leaves as the page's flight begins: its chrome, ghosted where it stood. Nothing
// moves under reduced motion, the system's or the site's.
import { stillCopy } from "@gnoworld/ui";
import { motionOf } from "../../space/motion.ts";
import { gsap } from "gsap";
import { asksFull, FULL_MOVE } from "../../fullChat.ts";
import { leavePage, pageNow, RISING } from "./arrival.ts";

/** Rises `parts` in one after the other, the first `after` ms from now, as the dive's demo's text (D401): from 18 px below, 0.7 s,
 * power3.out, 0.05 s apart; `across`, from 30 px to the right, 0.6 s, 0.06 s apart (the rail's worlds). */
export function riseIn(parts: Iterable<Element>, after: number, across = false): void {
  const moving = [...parts];
  if (motionOf().matches || moving.length === 0) return;
  const from = across ? { x: 30, autoAlpha: 0 } : { y: 18, autoAlpha: 0 };
  const to = across ? { x: 0, duration: 0.6, stagger: 0.06 } : { y: 0, duration: 0.7, stagger: 0.05 };
  gsap.fromTo(moving, from, {
    ...to,
    autoAlpha: 1,
    ease: "power3.out",
    delay: after / 1000,
    clearProps: "transform",
  });
}

/** Swaps `part`'s content in place (a tag's rail, a system's): it fades out, `swap` changes it, and it fades back in, never moving; at once
 * under reduced motion. The tween, to stop it. */
export function swapIn(part: gsap.TweenTarget, swap: () => void): gsap.core.Timeline {
  const still = motionOf().matches;
  return gsap
    .timeline()
    .to(part, { autoAlpha: 0, duration: still ? 0 : 0.2, ease: "power2.in", onComplete: swap })
    .to(part, {
      autoAlpha: 1,
      duration: still ? 0 : 0.35,
      ease: "power2.out",
      delay: 0.05,
      clearProps: "opacity,visibility",
    });
}

export function riseChrome(after: number, { header = true }: { header?: boolean } = {}): void {
  riseIn(
    RISING.slice(header ? 0 : 1).flatMap((selector) => [...document.querySelectorAll(selector)]),
    after,
  );
}

/** Whether the scene already stood when a page mounted: a return to the cosmos from a page, not the first load (SpaceLoader rises that). */
export const returning = (): boolean => document.querySelector("canvas[data-scene='on']") !== null;

export { loading } from "./firstLook.ts";

// The cosmos comes back under a flight: the hero and the worlds rise as it lands.
export const RETURN_AFTER = 450;

/** A fading ghost of each `[data-exit]` part in sight, as its page goes, so the page coming in is not cut in on them. Copied now, shown
 * once the commit is done unless the page `stayed` (React's strict second run, in development). Reduced motion: none. */
export function ghost(stayed: () => boolean): void {
  // The page that leaves, as it is told now: the page after it begins in this commit, before the copy is shown.
  const leaving = pageNow();
  const parts = [...document.querySelectorAll("[data-exit]")].filter(
    (part) => getComputedStyle(part).visibility !== "hidden",
  );
  const layer = document.createElement("div");
  if (parts.length === 0 || motionOf().matches) return;
  layer.setAttribute("aria-hidden", "true");
  // A ghost is the part's look and nothing else: it takes no pointer, and stands over the scene and the page, under the full chat
  // (ChatScreen.module.css, 3), which grows over it, and the loader.
  layer.style.cssText =
    "position:fixed;inset:0;z-index:2;pointer-events:none;color:var(--color-text);font:var(--font-body)";
  for (const part of parts) {
    // The copy itself is not inert, which would draw a plate's title as any heading (Panel.module.css).
    const copy = stillCopy(part);
    if (copy === undefined) continue;
    copy.removeAttribute("data-exit");
    copy.setAttribute("data-ghost", "");
    // What the page's place sets for it holds out of it too: a plate whose fill space draws keeps it hidden (globe.module.css).
    const fill = getComputedStyle(part).getPropertyValue("--plate-fill");
    if (fill !== "") copy.style.setProperty("--plate-fill", fill);
    if (getComputedStyle(part).position === "fixed") layer.append(copy);
    else {
      const { left, top, width, height } = part.getBoundingClientRect();
      const stand = document.createElement("div");
      stand.style.cssText = `position:absolute;left:${String(left)}px;top:${String(top)}px;width:${String(width)}px;height:${String(height)}px`;
      stand.append(copy);
      layer.append(stand);
    }
  }
  queueMicrotask(() => {
    if (stayed()) return;
    document.body.append(layer);
    // Into the full chat, which grows out of the dock's box over it: the ghost stays where it stood and dissolves, its parts never
    // sink or slide out from under the chat's panel (Alexis, 2026-11-09).
    if (asksFull(new URLSearchParams(location.search)))
      gsap.to(layer, {
        autoAlpha: 0,
        ...FULL_MOVE,
        onComplete: () => {
          layer.remove();
        },
      });
    else leavePage(layer, leaving);
  });
}
