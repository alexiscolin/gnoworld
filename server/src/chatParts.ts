// What the chat's start builds from its settings, apart: the unknown channels it alerts on, whom a room is listed to, and the
// verdicts' route (slice 3's plan, 3l, 3m, 4g).
import type { DatabaseSync } from "node:sqlite";
import type { Log } from "@gnoworld/service/log";
import type { Rooms } from "./rooms/create.ts";
import { listRooms } from "./rooms/rooms.ts";
import { listed, mayRead, staffOf } from "./rooms/types.ts";
import { verdictRoutes } from "./stream/verdicts.ts";
import { visitorOf } from "./visitor.ts";
import type { Options, Settings } from "./chat.ts";
import type { Config } from "./config.ts";
import { ircLink, type Link, type Said } from "./irc/link.ts";
import type { makeProgress } from "./moderation/catchup.ts";
import type { pinsFor } from "./pins/wire.ts";
import type { reconcilerFor } from "./rooms/wire.ts";

// A channel in Ergo the server did not make: with operator-only-creation, an operator made it (3l).
const unknownChannels =
  (db: DatabaseSync, log: Log) =>
  (names: readonly string[]): void => {
    const known = new Set(listRooms(db).map(({ name }) => name));
    for (const room of names) if (!known.has(room)) log("alert", { error: "unknown_room", room });
  };

// Whom a room is listed to: an archived room is a hidden one.
export const listedTo =
  (settings: Settings, keeper: Rooms) =>
  (room: string, who: string | undefined): boolean =>
    keeper.archived(room) ? staffOf(settings, room, who) : listed(settings, room, who);

// The verdicts of lines older than the stream's replay, by the stream's own rule of who reads (4g).
export function verdictsFor(
  db: DatabaseSync,
  settings: Settings,
  { session = () => undefined, now = Date.now }: Options,
) {
  return verdictRoutes({
    db,
    readable: (room, who) => mayRead(settings, room, who),
    session,
    visitor: (c) => visitorOf(c, settings.trustedProxy),
    now,
  });
}

interface LinkParts {
  db: DatabaseSync;
  ergo: Config["ergo"];
  redactRetryMs: number | undefined;
  progress: ReturnType<typeof makeProgress>;
  queue: { idle: () => Promise<void> };
  reconciler: ReturnType<typeof reconcilerFor>;
  mutes: { reapply: () => void };
  kept: ReturnType<typeof pinsFor>;
  recent: { taken: (room: string, msgid: string) => void };
  log: Log;
  onMessage: (said: Said, replayed: boolean) => void;
}

/** The IRC link in the server's rooms, none without Ergo's settings; what it hears is handed to `onMessage`. */
export function linkFor({
  db,
  ergo,
  redactRetryMs,
  progress,
  queue,
  reconciler,
  mutes,
  kept,
  recent,
  log,
  onMessage,
}: LinkParts): Link | undefined {
  if (ergo === undefined) return undefined;
  return ircLink({
    ...ergo,
    rooms: () => listRooms(db).map(({ name }) => name),
    lastChecked: progress.last,
    hold: progress.hold,
    drained: () => queue.idle(),
    ...(redactRetryMs === undefined ? {} : { redactRetryMs }),
    onReady: () => {
      reconciler.flags();
      mutes.reapply();
      reconciler.ask();
    },
    onJoin: reconciler.joined,
    ...kept.hooks,
    onRedact: (room, msgid) => {
      kept.hooks.onRedact(room, msgid);
      recent.taken(room, msgid);
    },
    onChannels: unknownChannels(db, log),
    onMessage,
    log,
  });
}
