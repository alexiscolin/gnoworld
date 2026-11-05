// The chat's moderation as it starts: the check of each line (3i), its world's rules, then OpenAI when a key is set, or the alert that
// none is; and the mutes with the strikes that call them (3k).
import type { DatabaseSync } from "node:sqlite";
import type { Config } from "../config.ts";
import type { Command } from "../irc/lines.ts";
import type { Log } from "@gnoworld/service/log";
import { roomWorld, worldRooms } from "../rooms/rooms.ts";
import { publicRoom, type World } from "../rooms/types.ts";
import { makeChecker } from "./check.ts";
import { makeMutes } from "./mute.ts";
import { moderationClient, type Answer } from "./provider.ts";
import { makeStrike } from "./strikes.ts";

interface Checked {
  worlds: ReadonlyMap<string, World>;
  moderation: Config["moderation"];
  spared?: (account: string) => boolean;
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

interface Struck {
  send: (command: Command, params: readonly string[]) => boolean;
  pepper: string;
  now: () => number;
}

/** The chat's mutes, and the strikes that call them. */
export function strikesFor(db: DatabaseSync, { moderation: { mute }, spared }: Checked, { send, pepper, now }: Struck) {
  const mutes = makeMutes({
    db,
    send,
    roomsOf: (world) => worldRooms(db, world),
    now,
    forMs: mute.minutes * 60_000,
    max: mute.max,
  });
  return { mutes, strike: makeStrike(db, { pepper, now, mute, mutes, spared: spared ?? (() => false) }) };
}
