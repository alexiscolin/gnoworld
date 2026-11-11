// The chat's moderation as it starts: the check of each line (3i), its world's rules, then OpenAI when a key is set, or the alert that
// none is; and the mutes with the strikes that call them (3k).
import type { DatabaseSync } from "node:sqlite";
import type { Config } from "../config.ts";
import type { Command } from "../irc/lines.ts";
import type { Log } from "@gnoworld/service/log";
import type { Rules } from "../roles/roles.ts";
import { roomWorld, worldRooms } from "../rooms/rooms.ts";
import { publicRoom, type World } from "../rooms/types.ts";
import { makeChecker, withBreaker } from "./check.ts";
import { makeMutes } from "./mute.ts";
import { makeNameChecker } from "./name.ts";
import { moderationClient, type Answer, type ModerationInput } from "./provider.ts";
import { makeStrike } from "./strikes.ts";

interface Checked {
  worlds: ReadonlyMap<string, World>;
  moderation: Config["moderation"];
  spared?: (account: string) => boolean;
  // The rules of a world the roles file does not list (D430): a room the server made in such a world is judged by them.
  defaults?: Rules | undefined;
}

interface Told {
  log: Log;
  pepper: string;
  now?: () => number;
  // The provider OpenAI's client stands for, given by the tests.
  provider?: (text: string) => Promise<Answer | "unchecked">;
  // The provider behind its one breaker (providerOf), made once and shared; made here when none is given.
  ask?: Ask | undefined;
}

// What the provider takes: a message, or a link card's text and picture (provider.ts).
// The provider behind the lines' breaker: whether it is paused, and the client itself for another breaker (the link cards').
export type Provider = Ask & { open: () => boolean; raw: Ask };
type Ask = (input: ModerationInput) => Promise<Answer | "unchecked">;

/** OpenAI's client when a key is set, or the one the tests give, behind one breaker: made once, it is shared by the lines' check, the
 * rooms' names and the guests' lines, so an outage seen by one is seen by all. */
export function providerOf({ moderation }: Checked, { provider, log, now = Date.now }: Told): Provider | undefined {
  // A given provider takes text: a card's parts reach it as their text.
  const client: Ask | undefined =
    provider === undefined
      ? moderation.openaiKey === undefined
        ? undefined
        : moderationClient({ key: moderation.openaiKey.reveal(), log })
      : (input) => provider(typeof input === "string" ? input : input.text);
  return client === undefined ? undefined : Object.assign(withBreaker(client, { now, log }), { raw: client });
}

/** The check of a room's name, as the line's check reads a message: its world's rules, then the provider (D394). */
export function nameCheckerFor(settings: Checked, options: Told) {
  return makeNameChecker({
    rulesOf: (world) => settings.worlds.get(world)?.rules,
    provider: options.ask ?? providerOf(settings, options),
    thresholds: settings.moderation.thresholds,
  });
}

/** The chat's check of a line. */
export function checkerFor(db: DatabaseSync, settings: Checked, options: Told) {
  const { worlds, moderation } = settings;
  const { log, pepper, now = Date.now } = options;
  if (moderation.openaiKey === undefined && options.provider === undefined) log("alert", { error: "moderation_off" });
  return makeChecker({
    db,
    rulesOf: (room) => {
      const world = roomWorld(db, room);
      // A room the server never made sends nothing anywhere: no world, no rules, not even the defaults'.
      return world === undefined ? undefined : (worlds.get(world)?.rules ?? settings.defaults);
    },
    publicRoom: (room) => publicRoom({ worlds }, room),
    provider: options.ask ?? providerOf(settings, options),
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
