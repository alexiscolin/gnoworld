// The flight that leaves on the click, before the page it goes to is on screen (that page's route may be long coming): the engine's near and
// landing wait for that page, which has no plate to arrive yet, and are given to it as it is shown.
import { cosmosAt, HOME_SYSTEM, isHome, trimmed } from "../../cosmosAt.ts";
import { motionOf } from "../../space/motion.ts";
import { sameAs, type Place } from "../../space/place.ts";
import type { Space } from "../../space/scene.ts";
import { endArrival, landTags } from "./arrival.ts";
import { markFlown } from "./flown.ts";
import { copyOf, fadeAway } from "./rise.ts";

const LEAVING = "[data-exit]:not([data-clear], nav)";
// The page's copy as it stood at a click on a link, taken, shown and the live parts hidden in that click's own task, before React's listener fills
// in what the click renders and before any paint: nothing of the live page shows or arrives between the click and the copy's fade. Kept for the
// click's bubbling listener to fade, or to drop where the router did not take the link; `flown` is the box's state it hid from.
let taken: { readonly layer: HTMLElement; readonly flown: string | undefined } | undefined;

// The flight that left, and whether it neared or landed before its page was shown.
let ahead: { readonly place: Place; near: boolean; landed: boolean } | undefined;

// The copy, shown over the live parts, which it hides (the flight's mark, globe.module.css); none under reduced motion or with no part in sight.
function show(): typeof taken {
  const layer = copyOf(LEAVING);
  if (layer === undefined) return undefined;
  const flown = document.querySelector<HTMLElement>("[data-globe]")?.dataset["flown"];
  document.body.append(layer);
  markFlown(true, false);
  return { layer, flown };
}

// The copy fades away as the flight begins; one not taken at the click (a label's) is made now.
function fadeOut(): void {
  const copy = taken ?? show();
  taken = undefined;
  if (copy !== undefined) fadeAway(copy.layer);
}

// A click the router did not take, or a flight that did not leave: the copy goes and the live parts come back as they were.
function drop(): void {
  if (taken === undefined) return;
  taken.layer.remove();
  markFlown(taken.flown === "flying", false);
  taken = undefined;
}

/** The flight to `place` leaves now, on the click that asks its page: the camera goes to the planet where the scene holds it, and to the page's
 * circle as the page lays it out. The leaving page's circle is no goal for the next planet: the flight goes for the middle's till then. False
 * (nothing left) under reduced motion, which jumps, and where space is not in sight or the camera stands there. */
export function depart(space: Space | undefined, asked: Place | undefined, to: Place): boolean {
  // The Earth's system goes by one id in an address and by the layout's first home namespace in the engine's labels.
  const place = to.kind === "system" && isHome(to.id) ? { kind: to.kind, id: HOME_SYSTEM } : to;
  if (space === undefined || !space.seen || motionOf().matches) return false;
  // The page on screen asked again (its planet clicked in its arrival, a link to itself): no navigation follows, so no page will come to take
  // the flight's events: they reach it as any flight's, and a wait for another page is over.
  if (asked !== undefined && sameAs(asked, place)) {
    ahead = undefined;
    if (!space.go(place)) return false;
    fadeOut();
    markFlown(true);
    return true;
  }
  if (!space.go(place)) return false;
  ahead = { place, near: false, landed: false };
  space.hold(undefined);
  // The page the click leaves hides its plate as the flight begins, as the next would: its copy fades, never cut out in a frame, the chat
  // dock's with it (it opens again with the destination's, as the arrival plays); not the cosmos's own parts, which stay through a flight
  // (arrival.ts RISING). Then the page's own arrival ends, which would reveal what is still hidden.
  fadeOut();
  endArrival();
  markFlown(true);
  return true;
}

/** Whether a flight waits for its page: the page that leaves takes no circle for space meanwhile. */
export const waiting = (): boolean => ahead !== undefined;

/** Holds the engine's `said` (its near or its landing) for the page; false where no flight waits for one. */
export function hold(said: "near" | "landed"): boolean {
  if (ahead === undefined) return false;
  ahead[said] = true;
  return true;
}

/** The page at `place` is shown, or none (an error, the full chat): the wait is over, and what the flight passed for it is given: its landing, else
 * its near (`near`); nothing if it passed neither or flew to another place. */
export function arrive(place: Place | undefined, near: () => void): void {
  const flight = ahead;
  ahead = undefined;
  if (flight !== undefined && place === undefined) markFlown(false);
  if (flight === undefined || place === undefined || !sameAs(flight.place, place)) return;
  if (flight.landed) {
    markFlown(false);
    landTags();
  } else if (flight.near) near();
}

// Whether a click is a plain one: the left button, no modifier.
const plain = (event: MouseEvent): boolean =>
  event.button === 0 && !(event.ctrlKey || event.metaKey || event.shiftKey || event.altKey);

// The link a click may send a flight by: a plain click on a link of the site's own, with no other target and no download.
function flyable(event: MouseEvent): HTMLAnchorElement | undefined {
  const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!plain(event) || !(link instanceof HTMLAnchorElement) || link.origin !== location.origin) return undefined;
  return link.hasAttribute("download") || (link.target !== "" && link.target !== "_self") ? undefined : link;
}

/** The place a page's path asks: the cosmos's own views by their address, a world by its page's path (`worlds`, each page's world); none for a
 * page that shows no place. */
function placeAt(path: string, worlds: ReadonlyMap<string, string>): Place | undefined {
  const at = cosmosAt(path);
  if (at?.view === "universe") return { kind: "universe" };
  if (at?.view === "system")
    return { kind: "system", id: isHome(at.system) ? HOME_SYSTEM : (at.system ?? HOME_SYSTEM) };
  const world = worlds.get(trimmed(path));
  return world === undefined ? undefined : { kind: "world", id: world };
}

/** Listens to the document's clicks: in the capture phase, before the router's, the page's copy is taken and shown at a click that may be a link's;
 * in the bubbling phase, once the router has taken it, `leave` is given the place it goes to and says whether a flight left, else the copy is
 * dropped. What it returns stops both. */
export function listenClicks(worlds: () => ReadonlyMap<string, string>, leave: (place: Place) => boolean): () => void {
  // Only a click that can be a flight's, a link to a place, takes the copy: any other (a modifier's, a new tab's, a page that shows no place)
  // is left as it is, its own page leaving as it does.
  const before = (event: MouseEvent): void => {
    drop();
    const link = flyable(event);
    if (link !== undefined && placeAt(link.pathname, worlds()) !== undefined) taken = show();
  };
  const after = (event: MouseEvent): void => {
    const link = flyable(event);
    const place = event.defaultPrevented && link !== undefined ? placeAt(link.pathname, worlds()) : undefined;
    if (place === undefined || !leave(place)) drop();
  };
  document.addEventListener("click", before, true);
  document.addEventListener("click", after);
  return () => {
    document.removeEventListener("click", before, true);
    document.removeEventListener("click", after);
  };
}
