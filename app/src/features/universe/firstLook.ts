// A page opened from its URL shows its scene from black (Universe.module.css): the canvas is held out of sight (`data-first`) till its
// page's planet stands as itself (`data-sharp`, frame.ts), and the arrival (arrival.ts) takes the page's box in that same frame. The home has
// its loader, which covers all that and opens the cosmos itself.
import { gsap } from "gsap";
import type { Place } from "../../space/place.ts";
import { motionOf } from "../../space/motion.ts";
import { SHARP, SHARP_MS } from "../../space/sharp.ts";
import { EMPHASIZED } from "./arrivalBase.ts";

const SHELL_FADE = 0.7;
const SHARP_SLACK_MS = 500;

/** Whether the loader still stands: what mounts under it rises with it. */
export const loading = (): boolean => document.querySelector("[role='status'][aria-label='Loading space']") !== null;

// The bar's last stretch of fill, in ms, before the loader fades (SpaceLoader.module.css: the fade's delay, the fill's transition).
const FILL_MS = 200;

let [released, pending] = [false, false];

/** Whether the loader covers the home's dive, which is then kept: it starts with the loader's leaving (`releaseDive`), never under it. */
export function holdsDive(place: Place): boolean {
  if (place.kind !== "home" || released || !loading()) return false;
  pending = true;
  return true;
}

/** The first frame is drawn: the loader's bar finishes its fill, then it fades. Gives how many ms until a dive kept under it starts (as the
 * fade does), none if no dive was kept. */
export function releaseDive(): number | undefined {
  released = true;
  const kept = pending;
  pending = false;
  if (!kept) return undefined;
  return motionOf().matches ? 0 : FILL_MS;
}

/** Whether the scene, held out of sight while its planet is not itself yet (frame.ts), is still to come: the shell does not show before it. */
export const holdsShell = (): boolean => document.querySelector("canvas[data-first]:not([data-sharp])") !== null;

/** The header and, with `page`, the page's own column come in on the arrival's clock, from the invisible where the first paint held them
 * (root.tsx); with no arrival to take them (a view with no scene) they come as the page is up. Under the home's loader, which covers them, they
 * are let go at once. */
export function revealShell(page: boolean): void {
  const root = document.documentElement;
  if (root.dataset["first"] === undefined) return;
  const parts = [document.querySelector("header"), page ? document.querySelector("main") : null].filter(
    (part) => part !== null,
  );
  // Only a part still held fades in: one that the CSS fallback already showed (a slow page) is let be, never dropped to 0 to fade back.
  const held = parts.every((part) => Number(getComputedStyle(part).opacity) < 1);
  const fade = held && !motionOf().matches && !loading();
  if (fade) gsap.set(parts, { autoAlpha: 0 });
  delete root.dataset["first"];
  if (fade) gsap.to(parts, { autoAlpha: 1, duration: SHELL_FADE, ease: EMPHASIZED, clearProps: "opacity,visibility" });
}

/** The scene's two layers, put under the page: the canvas, held out of sight unless the loader covers it or motion is reduced, which shows
 * once its page's planet is itself (frame.ts's `sharp` event), and the labels' box. */
export function layers(className: string): { canvas: HTMLCanvasElement; labels: HTMLElement } {
  const canvas = Object.assign(document.createElement("canvas"), { className });
  const labels = document.createElement("div");
  labels.style.cssText = "position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:0";
  document.body.prepend(canvas, labels);
  if (loading()) revealShell(false);
  else if (!motionOf().matches) {
    canvas.dataset["first"] = "";
    const sharpen = (): void => {
      canvas.dataset["sharp"] = "";
    };
    canvas.addEventListener(SHARP, sharpen, { once: true });
    // The frame's loop says it, but it does not run with no worlds' file, under the full chat or in a hidden tab: the hold ends by its own clock.
    setTimeout(sharpen, SHARP_MS + SHARP_SLACK_MS);
  }
  return { canvas, labels };
}
