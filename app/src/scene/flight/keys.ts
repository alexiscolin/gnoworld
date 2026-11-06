// What lands or starts a flight from the page (7g; docs/DESIGN-SYSTEM.md, "Motion": "a click or Esc during a flight lands immediately"):
// Escape or a press lands one at once, and the click of that press aims at nothing; Escape once at a star flies back to the view at rest;
// a click on space aims at the star nearest it. A key a field or a dialog holds is theirs.
import { keyHeld } from "../keyHeld.ts";
import { isPlace, onSpace, starAt } from "./aim.ts";
import type { FlightDevice, FlightGoal } from "./goal.ts";

interface Flown {
  readonly flying: boolean;
  fly(goal: FlightGoal): void;
  land(): void;
}

/** Listens to the page's keys and clicks for `flights`, till `signal` ends. */
export function listen(
  flights: Flown,
  device: Pick<FlightDevice, "eye" | "cosmos" | "camera">,
  signal: AbortSignal,
): void {
  let swallow = false;
  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape" || event.defaultPrevented || keyHeld(event)) return;
      if (flights.flying) flights.land();
      else if (device.eye.look !== undefined) flights.fly({ kind: "rest" });
    },
    { signal },
  );
  window.addEventListener(
    "pointerdown",
    () => {
      swallow = flights.flying;
      flights.land();
    },
    { signal },
  );
  window.addEventListener(
    "click",
    ({ target, clientX, clientY }) => {
      const swallowed = swallow;
      swallow = false;
      const sight = device.cosmos();
      if (swallowed || flights.flying || !onSpace(target) || sight === undefined || !isPlace(sight.eye)) return;
      const star = starAt(sight, device.camera, { x: clientX, y: clientY });
      if (star !== undefined) flights.fly({ kind: "star", id: star.id });
    },
    { signal },
  );
}
