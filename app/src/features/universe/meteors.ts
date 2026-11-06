// The home's meteors (frames 4, 6, 7): a few white streaks crossing the sky now and then while the cosmos shows, never over the hero's text,
// none under reduced motion (the sky held still) nor when the reader saves data. Lines on the page over the canvas, no scene object: a
// chunk of its own, asked by the cosmos's feed as it shows (worldsFeed.ts), since they belong to its sky.
import { savesData } from "../../lib/saveData.ts";
import labelStyles from "../../scene/cosmos/labels.module.css";
import styles from "./Meteors.module.css";

// One every 9 to 25 s, so a reader sees a few a minute at most.
const EVERY_MS = 9_000;
const SPREAD_MS = 16_000;
// ponytail: forty a showing, about eleven minutes of sky; then it rests till the cosmos shows again. A clock of the scene's if it matters.
const MOST = 40;
// A streak's length and the way it flies, in the page's pixels, the air it keeps from the hero's text, and the bands it never reaches: the
// rail's at the right (core's RAIL, 143 px and its air) and the ticker's at the foot.
const LENGTH = 220;
const TRAVEL = 320;
const AIR = 32;
const RIGHT_BAND = 160;
const FOOT_BAND = 60;

interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}
const crosses = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/** A meteor's start and heading in a window of `view`, its path clear of every box of `text`; none when no try finds one. */
export function meteorPath(
  random: () => number,
  view: { readonly width: number; readonly height: number },
  text: readonly Box[],
): { x: number; y: number; angle: number } | undefined {
  const { width, height } = view;
  for (let tries = 0; tries < 8; tries += 1) {
    const x = width * (0.3 + random() * 0.55);
    const y = height * (0.1 + random() * 0.55);
    // Down and to the right, from nearly flat (frame 4) to nearly upright (frame 6).
    const angle = (15 + random() * 65) * (Math.PI / 180);
    const end = { x: x + Math.cos(angle) * (TRAVEL + LENGTH), y: y + Math.sin(angle) * (TRAVEL + LENGTH) };
    const path = { left: x - AIR, top: y - AIR, right: Math.max(x, end.x) + AIR, bottom: Math.max(y, end.y) + AIR };
    if (end.x < width - RIGHT_BAND && end.y < height - FOOT_BAND && !text.some((box) => crosses(box, path)))
      return { x, y, angle };
  }
  return undefined;
}

// The hero's box as the page stands it now, the one the cosmos keeps its worlds clear of (worldsFeed.ts): its count, words and markets.
const heroText = (): Box[] =>
  [...document.querySelectorAll("[data-clear]")].map((each) => each.getBoundingClientRect());

function fly(layer: HTMLElement): void {
  const path = meteorPath(Math.random, { width: innerWidth, height: innerHeight }, heroText());
  if (path === undefined) return;
  const meteor = document.createElement("span");
  meteor.className = styles["meteor"] ?? "";
  meteor.style.setProperty("--_x", `${String(Math.round(path.x))}px`);
  meteor.style.setProperty("--_y", `${String(Math.round(path.y))}px`);
  meteor.style.setProperty("--_angle", `${path.angle.toFixed(3)}rad`);
  meteor.style.setProperty("--_travel", `${String(TRAVEL)}px`);
  meteor.addEventListener("animationend", () => {
    meteor.remove();
  });
  layer.append(meteor);
}

/** Sends meteors across the sky now and then until `signal` aborts, while the scene's canvas runs and the tab shows. */
export function startMeteors(signal: AbortSignal): void {
  if (savesData() || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const layer = document.createElement("div");
  // The labels' layer's rule: the window's corner over the canvas, under the page.
  layer.className = labelStyles["layer"] ?? "";
  layer.setAttribute("aria-hidden", "true");
  layer.dataset["meteors"] = "";
  document.body.append(layer);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const next = (left: number) => {
    if (left === 0) return;
    timer = setTimeout(
      () => {
        // The scene's canvas running (sceneRuns.ts's mark): a covered or lost one sends none.
        if (!document.hidden && document.querySelector('canvas[data-scene="on"]') !== null) fly(layer);
        next(left - 1);
      },
      EVERY_MS + Math.random() * SPREAD_MS,
    );
  };
  next(MOST);
  signal.addEventListener("abort", () => {
    clearTimeout(timer);
    layer.remove();
  });
}
