// An arrival at a place (slots.tsx asks at every one): the quests' visit steps it does, today's stop it reaches, the streak once the day's
// stops are all reached, and the line the pill adds under "Stamped". What the device holds is read through `change`, which reads it first,
// so another tab's visit counts.
import { reach, reachedOn, streakAfter } from "@gnoworld/core";
import type { Slots } from "../../slots.tsx";
import { stepsDone, withSteps } from "../quests/index.ts";
import { stopsOn } from "./stops.ts";

type Line = Slots["arrivalLine"];

/** Applies what the arrival does to the device; the pill's line, or none for a place that is no stop of the day or one reached already. */
export function arrive(...[arrival, change]: Parameters<Line>): string | undefined {
  const steps = stepsDone(arrival.universe, { key: arrival.key });
  if (steps.length > 0) change("quests", (held) => withSteps(held, steps));
  const stops = stopsOn(arrival.universe, arrival.day);
  if (!stops.some(({ key }) => key === arrival.key)) return undefined;
  let before: readonly string[] = [];
  change("expedition", (held) => {
    before = reachedOn(held, arrival.day);
    return reach(held, arrival.day, arrival.key);
  });
  if (before.includes(arrival.key)) return undefined;
  const done = new Set([...before, arrival.key]);
  const reached = stops.filter(({ key }) => done.has(key)).length;
  if (reached < stops.length) return `Today's expedition · ${String(reached)} of ${String(stops.length)}`;
  let days = 1;
  change("streak", (held) => {
    const next = streakAfter(held, arrival.day);
    days = next.count;
    return next;
  });
  return `Today's expedition done · ${String(days)}-day streak`;
}
