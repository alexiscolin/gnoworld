// The home's first screen names its featured worlds (D510, D549): those standing this many pixels across their radius as drawn, the Earth
// never, the largest first. Into `out`, made anew each frame. And the pill's own parts: a name, who is here, the way in.
import { placeOf, type Planet, type System, type Vec } from "./layout.ts";
import type { Seen } from "./see.ts";
import { iconNode } from "@gnoworld/ui";
import { scaleOf } from "./boosts.ts";
import { latch } from "./vista.ts";
import styles from "./labels.module.css";

const MID_PX = 12;

type Named = Planet | System;

export function midOf(seen: Seen, { at, seconds, out }: { at: Vec; seconds: number; out: Named[] }): readonly Named[] {
  out.length = 0;
  for (const { planet } of latch.featured)
    if (seen.pixels(placeOf(planet, seconds, at), planet.radius * scaleOf(planet.index)) >= MID_PX) out.push(planet);
  return out.sort((a, b) => ("radius" in b ? b.radius : 0) - ("radius" in a ? a.radius : 0));
}

/** What the page hands the names: what a click leads to, how a world is named, and its one live fact once known. */
export interface LabelHooks {
  readonly enter: (item: Named) => void;
  readonly name: (item: Named) => string;
  /** How many are here in a world now: none while unknown. */
  readonly fact?: ((id: string) => number | undefined) | undefined;
}

/** The parts of a name pill: its name and the people here (the glyph and the number); no button, the pill is the link as a whole (D551). */
export function fillPill(button: HTMLElement): void {
  const count = document.createElement("span");
  count.className = `nowrap with-icon ${styles["count"] ?? ""}`;
  count.append(iconNode("people", "s"), document.createTextNode(""));
  button.append(document.createElement("b"), count);
}

// The number here shown, or hidden while unknown or none.
function showCount(button: HTMLElement, here: number | undefined): void {
  const count = button.children[1];
  if (!(count instanceof HTMLElement) || count.lastChild === null) return;
  const hidden = here === undefined || here === 0;
  if (count.hidden !== hidden) count.hidden = hidden;
  const text = String(here ?? "");
  if (count.lastChild.textContent !== text) count.lastChild.textContent = text;
}

/** Puts a name `button` where its world stands (`on`, the world's middle on screen), 14 px over it, or on the home's first screen under the
 * world's own disc as drawn (D541), so it reads as that world's tag; a world's with the number here, none while unknown or none (D551, D562). */
export function tagOf(
  button: HTMLElement,
  {
    seen,
    at,
    item,
    on,
    arrival,
    fact,
  }: {
    seen: Seen | undefined;
    at: Vec;
    item: Named;
    on: Vec;
    arrival: boolean;
    fact: LabelHooks["fact"];
  },
): void {
  const under = arrival && "radius" in item;
  // Every world's name carries who is there, as the video's labels do (D562); a system's, none.
  showCount(button, "radius" in item ? fact?.(item.id) : undefined);
  const drop = under ? (seen?.pixels(at, item.radius * scaleOf(item.index)) ?? 0) + 10 : -14;
  button.style.transform = `translate3d(${on.x.toFixed(1)}px, ${(on.y + drop).toFixed(1)}px, 0)`;
}
