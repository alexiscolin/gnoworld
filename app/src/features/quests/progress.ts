// The quests as the page shows them (slice 8; ADR-0002 §1, "Quests"): each step's world, whether this device did it, and which steps a
// visit or the reader's own words in a room do. A step is done in any order; the call that ends each quest waits for slice 9's signing.
import quests from "../../../data/quests.json" with { type: "json" };
import { worldOf } from "../expedition/index.ts";

/** A step as the card draws it. */
export interface StepView {
  readonly id: string;
  readonly kind: "visit" | "talk" | "call";
  readonly title: string;
  readonly done: boolean;
  /** Where it leads: the world's page for a visit or a talk, the realm's view for a call. */
  readonly path: string | undefined;
  /** For a call: the realm and its function. */
  readonly call?: { readonly realm: string; readonly function: string } | undefined;
}

/** A quest as the card draws it. */
export interface QuestView {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly reward: string;
  readonly steps: readonly StepView[];
}

type Step = (typeof quests)[number]["steps"][number];

// The file's kinds, which its schema bounds at the build.
const kindOf = (kind: string): StepView["kind"] => (kind === "talk" || kind === "call" ? kind : "visit");

// What a step is, by the file's fields: a world's key, and the main room of a talk's hub.
const keyOf = (universe: string, step: Step) => worldOf(universe, step)?.key;
const roomOf = (step: Step) => ("hub" in step && step.kind === "talk" ? `#${step.hub}` : undefined);

/** The quests of `universe`, with what `progress` (the device's done steps, by quest) holds. */
export function questsOf(universe: string, progress: Readonly<Record<string, readonly string[]>>): QuestView[] {
  return quests
    .filter((quest) => quest.universe === universe)
    .map((quest) => ({
      id: quest.id,
      title: quest.title,
      description: quest.description,
      reward: quest.reward,
      steps: quest.steps.map((step) => ({
        id: step.id,
        kind: kindOf(step.kind),
        title: step.title,
        done: progress[quest.id]?.includes(step.id) === true,
        path: worldOf(universe, step)?.path,
        call:
          "function" in step && step.realm !== undefined ? { realm: step.realm, function: step.function } : undefined,
      })),
    }));
}

/** The steps of `universe`'s quests a visit to the world `key`, or the reader's words in `room`, does: [quest, step] pairs. */
export function stepsDone(universe: string, done: { key: string } | { room: string }): [string, string][] {
  return quests
    .filter((quest) => quest.universe === universe)
    .flatMap((quest) =>
      quest.steps
        .filter((step) =>
          "key" in done ? step.kind === "visit" && keyOf(universe, step) === done.key : roomOf(step) === done.room,
        )
        .map((step): [string, string] => [quest.id, step.id]),
    );
}

/** The device's progress with `pairs` done: the same object when none is new. */
export function withSteps(
  progress: Record<string, string[]>,
  pairs: readonly [string, string][],
): Record<string, string[]> {
  const next: Record<string, string[]> = Object.fromEntries(
    Object.entries(progress).map(([id, steps]) => [id, [...steps]]),
  );
  let changed = false;
  for (const [quest, step] of pairs) {
    const steps = (next[quest] ??= []);
    if (steps.includes(step)) continue;
    steps.push(step);
    changed = true;
  }
  return changed ? next : progress;
}
