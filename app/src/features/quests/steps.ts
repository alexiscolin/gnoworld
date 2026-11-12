// The challenge steps of a day: the expedition's stops reached and the quests' steps done, over all of them.
import { reachedOn } from "@gnoworld/core";
import { stopsOn } from "../expedition/index.ts";
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
  const reached = new Set(reachedOn(expedition, today));
  const stops = stopsOn(universe, today);
  const steps = questsOf(universe, quests).flatMap((quest) => quest.steps);
  return {
    done: stops.filter(({ key }) => reached.has(key)).length + steps.filter(({ done }) => done).length,
    of: stops.length + steps.length,
  };
}
