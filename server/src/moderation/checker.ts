// The check of each line as the chat starts it (3i): its world's rules, then OpenAI when a key is set, or the alert that none is.
import type { DatabaseSync } from "node:sqlite";
import type { Config } from "../config.ts";
import type { Log } from "../log.ts";
import { roomWorld } from "../rooms/rooms.ts";
import { publicRoom, type World } from "../rooms/types.ts";
import { makeChecker } from "./check.ts";
import { moderationClient, type Answer } from "./provider.ts";

interface Checked {
  worlds: ReadonlyMap<string, World>;
  moderation: Config["moderation"];
}

interface Told {
  log: Log;
  pepper: string;
  now?: () => number;
  // The provider OpenAI's client stands for, given by the tests.
  provider?: (text: string) => Promise<Answer | "unchecked">;
}

/** The chat's check of a line. */
export function checkerFor(db: DatabaseSync, { worlds, moderation }: Checked, options: Told) {
  const { log, pepper, now = Date.now } = options;
  const key = moderation.openaiKey;
  if (key === undefined && options.provider === undefined) log("alert", { error: "moderation_off" });
  return makeChecker({
    db,
    rulesOf: (room) => worlds.get(roomWorld(db, room) ?? "")?.rules,
    publicRoom: (room) => publicRoom({ worlds }, room),
    provider: options.provider ?? (key === undefined ? undefined : moderationClient({ key: key.reveal(), log })),
    thresholds: moderation.thresholds,
    pepper,
    log,
    now,
    newAccountMs: moderation.newAccountHours * 60 * 60_000,
  });
}
