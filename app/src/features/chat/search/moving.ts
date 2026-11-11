// The arrow keys among the search's results (slice 13, C): Down from the field goes to the first result, Up and Down move among them, Up from the first
// goes back to the field, Home and End go to the ends. Enter is the button's own, Escape the panel's. The results are the panel's `[data-hit]` buttons.
import type { KeyboardEvent } from "react";

const STEP: Readonly<Record<string, number>> = { ArrowDown: 1, ArrowUp: -1 };

/** Moves the focus for a key the results take; whether it did (the key's default is then kept from the page). */
export function moveAmongHits(event: KeyboardEvent<HTMLElement>): boolean {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
  const hits = [...event.currentTarget.querySelectorAll<HTMLElement>("[data-hit]")];
  const field = event.currentTarget.querySelector<HTMLElement>("input");
  const target = event.target as HTMLElement;
  const at = hits.indexOf(target);
  const to = at === -1 ? fromField(event.key, target === field, hits.length) : within(event.key, at, hits.length);
  if (to === undefined) return false;
  event.preventDefault();
  (to === "field" ? field : hits[to])?.focus();
  return true;
}

// From the field: Down goes to the first result, when there is one.
const fromField = (key: string, inField: boolean, count: number): number | undefined =>
  inField && key === "ArrowDown" && count > 0 ? 0 : undefined;

// From a result: one step, round the ends but for Up from the first, which is the field's; Home and End.
function within(key: string, at: number, count: number): number | "field" | undefined {
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  const step = STEP[key];
  if (step === undefined) return undefined;
  if (at + step < 0) return "field";
  return Math.min(at + step, count - 1);
}
