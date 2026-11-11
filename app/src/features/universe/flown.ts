// Whether a flight to a page's planet is on, put on the planet's box (`data-flown`), which the page's parts follow (globe.module.css): a box that
// mounts after the flight began (its route's chunk comes late) takes the state as it comes (`syncFlown`), never standing in view while the camera flies.
import { waitTags } from "./arrival.ts";

let flightOn = false;

/** Puts the flight's state on the page's planet box, if one stands. */
export const syncFlown = (): void =>
  document.querySelector("[data-globe]")?.setAttribute("data-flown", flightOn ? "flying" : "landed");

/** A flight to the page's planet begins (`flying`) or ends. */
export function markFlown(flying: boolean): void {
  flightOn = flying;
  syncFlown();
  if (flying) waitTags();
}
