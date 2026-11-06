// The discovery's data files (slice 8): the daily expedition's stops and the quests across worlds, each naming worlds the site holds.
import { byId, DATA_CAPS, Key, RealmPath, text, unique } from "./data.ts";
import { ExportedName } from "./worlds.ts";
import { z } from "./zod.ts";

// A world as the expedition and the quests name it (slice 8): a hub of the file's universe by its slug, or a realm by its path,
// never both; the build checks the slug against hubs.json (app/src/dataFiles.ts).
const oneWorld = (row: { hub?: string | undefined; realm?: string | undefined }) =>
  (row.hub === undefined) !== (row.realm === undefined);

/** The pool of the daily expedition's stops (ADR-0002 §1, "Daily expedition"): each a world the team curates, a realm's with its name, with a
 * line on why to go; `live` marks a world where something moves every day, which the first stop of a day is chosen among (core's
 * `expeditionOf`). */
export const Expedition = byId(
  z
    .strictObject({
      id: Key,
      universe: Key,
      hub: z.optional(Key),
      realm: z.optional(RealmPath),
      name: z.optional(text(DATA_CAPS.name)),
      why: text(DATA_CAPS.title),
      live: z.optional(z.boolean()),
    })
    // A hub's name is hubs.json's, one source for the arrival's pill and the expedition; a realm's is the stop's.
    .check(
      z.refine(
        (stop) => oneWorld(stop) && (stop.realm === undefined) === (stop.name === undefined),
        "a hub, or a named realm",
      ),
    ),
);

/** The most steps a quest holds, and the fewest. */
const QUEST_STEPS = { min: 2, max: 8 } as const;

// A quest's step: a visit to a world, words said in a hub's main room, or a realm's call, which ends every quest (slice 9 signs it).
const Step = z
  .strictObject({
    id: Key,
    kind: z.enum(["visit", "talk", "call"]),
    title: text(DATA_CAPS.title),
    hub: z.optional(Key),
    realm: z.optional(RealmPath),
    function: z.optional(ExportedName),
  })
  .check(
    z.refine(
      (step) =>
        step.kind === "visit"
          ? oneWorld(step) && step.function === undefined
          : step.kind === "talk"
            ? step.hub !== undefined && step.realm === undefined && step.function === undefined
            : step.hub === undefined && step.realm !== undefined && step.function !== undefined,
      "a visit names a hub or a realm, a talk a hub, a call a realm and its function",
    ),
  );

/** Quests across worlds (ADR-0002 §1, "Quests"): steps in order, at least two, the last a realm's call; a reward that stays on the device. */
export const Quests = byId(
  z.strictObject({
    id: Key,
    universe: Key,
    title: text(DATA_CAPS.title),
    description: text(DATA_CAPS.description),
    reward: text(DATA_CAPS.name),
    steps: unique(
      z.array(Step).check(
        z.minLength(QUEST_STEPS.min),
        z.maxLength(QUEST_STEPS.max),
        z.refine((steps) => steps.at(-1)?.kind === "call", "a quest ends on a realm's call"),
      ),
      "id",
      (step: { id: string }) => step.id,
    ),
  }),
);
