// The flight that leaves on the click, before the page it goes to is on screen (that page's route may be long coming): the engine's near and
// landing wait for that page, which has no plate to arrive yet, and are given to it as it is shown.
import { cosmosAt, HOME_SYSTEM, isHome, trimmed } from "../../cosmosAt.ts";
import { motionOf } from "../../space/motion.ts";
import { sameAs, type Place } from "../../space/place.ts";
import type { Space } from "../../space/scene.ts";
import { landTags } from "./arrival.ts";
import { markFlown } from "./flown.ts";
import { ghost } from "./rise.ts";

// The flight that left, and whether it neared or landed before its page was shown.
let ahead: { readonly place: Place; near: boolean; landed: boolean } | undefined;

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
    if (space.go(place)) markFlown(true);
    return false;
  }
  if (!space.go(place)) return false;
  ahead = { place, near: false, landed: false };
  space.hold(undefined);
  // The page the click leaves hides its plate as the flight begins, as the next would: its copy fades on the leave clock, never cut out in a
  // frame, the chat dock's with it (it opens again with the destination's, as the arrival plays); not the cosmos's own parts, which stay
  // through a flight (arrival.ts RISING).
  ghost(() => false, "[data-exit]:not([data-clear], nav)", true);
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

const linkOf = (event: MouseEvent): HTMLAnchorElement | undefined => {
  const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
  const taken = event.defaultPrevented && event.button === 0;
  return taken && link instanceof HTMLAnchorElement && link.origin === location.origin ? link : undefined;
};

/** The place a click on a link the router took (it prevents the default) goes to: the cosmos's own views by their address, a world by its page's
 * path (`worlds`, each page's world); none for a click the router left to the browser, a link out or a page that shows no place. */
export function placeOfClick(event: MouseEvent, worlds: ReadonlyMap<string, string>): Place | undefined {
  const path = linkOf(event)?.pathname;
  if (path === undefined) return undefined;
  const at = cosmosAt(path);
  if (at?.view === "universe") return { kind: "universe" };
  if (at?.view === "system")
    return { kind: "system", id: isHome(at.system) ? HOME_SYSTEM : (at.system ?? HOME_SYSTEM) };
  const world = worlds.get(trimmed(path));
  return world === undefined ? undefined : { kind: "world", id: world };
}
