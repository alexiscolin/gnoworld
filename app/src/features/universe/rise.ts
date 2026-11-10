// What rises in as the cosmos opens, from a step below, one after the other (the first load's one clock, SpaceLoader.tsx; a return from a
// page's flight, routes/home.tsx and the rail), and what leaves as the page's flight begins: its chrome, ghosted where it stood. Nothing
// moves under reduced motion, the system's or the site's.
import { stillCopy } from "@gnoworld/ui";
import { motionOf } from "../../space/motion.ts";
import { gsap } from "gsap";
import { asksFull, FULL_MOVE } from "../../fullChat.ts";
import { leavePage, pageNow, RISING } from "./arrival.ts";

const KEEPS = "[data-clear], nav[aria-label='Worlds']";

/** Rises `parts` in one after the other, the first `after` ms from now, as the dive's demo's text (D401): from 18 px below, 0.7 s,
 * power3.out, 0.05 s apart; `across`, from 30 px to the right, 0.6 s, 0.06 s apart (the rail's worlds). */
function lift(parts: Iterable<Element>, after: number, how: "across" | "together" | "each"): void {
  const moving = [...parts];
  if (motionOf().matches || moving.length === 0) return;
  const across = how === "across";
  const from = across ? { x: 30, autoAlpha: 0 } : { y: 18, autoAlpha: 0 };
  const to = across
    ? { x: 0, duration: 0.6, stagger: 0.06 }
    : { y: 0, duration: 0.7, stagger: how === "together" ? 0 : 0.05 };
  // The hero's and the worlds' identity transform stays: clearing it makes Chromium count their whole box as a layout shift (P408B). Both
  // are fixed or plain boxes with no fixed part inside (menus are popovers, in the top layer); the header's parts clear.
  gsap.fromTo(moving, from, {
    ...to,
    autoAlpha: 1,
    ease: "power3.out",
    delay: after / 1000,
    onComplete: () => {
      const clear = moving.filter((part) => across || !part.matches(KEEPS));
      if (clear.length > 0) gsap.set(clear, { clearProps: "transform" });
    },
  });
}

export const riseIn = (parts: Iterable<Element>, after: number, across = false): void => {
  lift(parts, after, across ? "across" : "each");
};

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

/** One slot of the rise: `slide` parts rise, `fade` parts (fixed ones) only fade, so no fixed part ever has a transformed ancestor: a
 * transform makes a containing block of them, and the bar at a phone's foot would stand in the header's box while it rises. */
interface Slot {
  slide: Element[];
  fade: Element[];
}

// A part to rise whole where nothing fixed stands in it; else its own parts, the fixed ones only fading; what is not drawn (a closed menu) none.
function slotOf(part: Element): Slot {
  const own = getComputedStyle(part);
  if (own.display === "none") return { slide: [], fade: [] };
  if (own.position === "fixed") return { slide: [], fade: [part] };
  const fixed = [...part.querySelectorAll("*")].some((each) => {
    const style = getComputedStyle(each);
    return style.display !== "none" && style.position === "fixed";
  });
  if (!fixed) return { slide: [part], fade: [] };
  const slots = [...part.children].map(slotOf);
  return { slide: slots.flatMap((slot) => slot.slide), fade: slots.flatMap((slot) => slot.fade) };
}

// The header splits into its own parts (above); the others rise whole.
function slots(header: boolean): Slot[] {
  return RISING.slice(header ? 0 : 1)
    .map((selector) => {
      const found = [...document.querySelectorAll(selector)];
      if (selector !== "header") return { slide: found, fade: [] };
      const each = found.map(slotOf);
      return { slide: each.flatMap((slot) => slot.slide), fade: each.flatMap((slot) => slot.fade) };
    })
    .filter((slot) => slot.slide.length + slot.fade.length > 0);
}

/** Hides the parts that rise (`riseChrome`'s) while the loader covers them: nothing under it is drawn, so what loads into them (a count, a
 * style sheet) shifts nothing the browser counts (P408B). Gives how to show them again; the rise, run right after, hides them at once. */
export function holdChrome(): () => void {
  const held = slots(true).flatMap((slot) =>
    [...slot.slide, ...slot.fade].filter((part) => part instanceof HTMLElement),
  );
  for (const part of held) part.style.visibility = "hidden";
  return () => {
    for (const part of held) part.style.removeProperty("visibility");
  };
}

/** The header's parts, the hero and the worlds' list rise in, one slot after the other (a slot's parts together, the first `after` ms on). */
export function riseChrome(after: number, { header = true }: { header?: boolean } = {}): void {
  slots(header).forEach(({ slide, fade }, index) => {
    const at = after + index * 50;
    lift(slide, at, "together");
    if (fade.length > 0 && !motionOf().matches)
      gsap.fromTo(fade, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.7, ease: "power3.out", delay: at / 1000 });
  });
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
