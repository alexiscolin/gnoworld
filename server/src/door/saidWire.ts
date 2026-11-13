// Jarvis's public answers as the chat makes them: the room's rules and the provider of its guests, the bot's relay.
import type { DatabaseSync } from "node:sqlite";
import type { Log } from "@gnoworld/service/log";
import { guestRules } from "../guest/rules.ts";
import type { Link } from "../irc/link.ts";
import type { Thresholds } from "../moderation/decide.ts";
import type { Answer } from "../moderation/provider.ts";
import type { Rules } from "../roles/roles.ts";
import { roomWorld } from "../rooms/rooms.ts";
import { publicRoom, type Typed } from "../rooms/types.ts";
import { makeRecentLines } from "./lines.ts";
import { makeSaid, type Answers } from "./said.ts";

interface Parts {
  /** What the door gives: the hosts a link may name; none, no public answers. */
  door?:
    | {
        heard: { said: (account: string) => void };
        changed: (room: string) => void;
        said?: { hosts: readonly string[] };
      }
    | undefined;
  log: Log;
  now: () => number;
  ask: ((text: string) => Promise<Answer | "unchecked">) | undefined;
  link: () => Link | undefined;
}

/** The recent lines of the rooms, told which public answers go with a line taken, and those answers: none without the door's part. */
export function recentFor(
  db: DatabaseSync,
  settings: Typed & { defaults?: Rules | undefined; moderation: { thresholds: Thresholds } },
  parts: Parts,
) {
  const answers = saidFor(db, settings, parts);
  return {
    answers,
    recent: makeRecentLines({ isPublic: (room) => publicRoom(settings, room), ...parts.door, answers }),
  };
}

function saidFor(
  db: DatabaseSync,
  settings: Typed & { defaults?: Rules | undefined; moderation: { thresholds: Thresholds } },
  { door, log, now, ask, link }: Parts,
): Answers | undefined {
  const said = door?.said;
  if (said === undefined) return undefined;
  return makeSaid(db, {
    now,
    log,
    isPublic: (room) => publicRoom(settings, room),
    rulesOf: (room) => guestRules(settings.worlds.get(roomWorld(db, room) ?? "")?.rules, settings.defaults),
    provider: ask,
    thresholds: settings.moderation.thresholds,
    relay: (room, nick, text) => link()?.relay(room, nick, text) ?? Promise.resolve(false),
    hosts: said.hosts,
  });
}
