// The challenge steps of a day: the expedition's stops reached and the quests' steps done, over all of them.
import type { reachedOn } from "@gnoworld/core";
import { progressOn } from "../expedition/index.ts";
import { questsOf } from "./progress.ts";

/** How many steps the day's challenges hold in `universe`, and how many of them this device did. */
export function challengeSteps(
  universe: string,
  today: string,
  {
    expedition,
    quests,
  }: { expedition: Parameters<typeof reachedOn>[0]; quests: Readonly<Record<string, readonly string[]>> },
): { done: number; of: number } {
  const { stops, count } = progressOn(universe, today, expedition);
  const steps = questsOf(universe, quests).flatMap((quest) => quest.steps);
  return { done: count + steps.filter(({ done }) => done).length, of: stops.length + steps.length };
}
