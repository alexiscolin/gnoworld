// What the chat's start builds from its settings, apart: the unknown channels it alerts on, whom a room is listed to, and the
// verdicts' route (slice 3's plan, 3l, 3m, 4g).
import type { DatabaseSync } from "node:sqlite";
import type { Log } from "@gnoworld/service/log";
import type { Rooms } from "./rooms/create.ts";
import type { Command } from "./irc/lines.ts";
import type { Mutes } from "./moderation/mute.ts";
import { ensureNamed, ensureRooms, listRooms, worldRooms } from "./rooms/rooms.ts";
import { listed, mayRead, staffOf } from "./rooms/types.ts";
import { verdictRoutes } from "./stream/verdicts.ts";
import { visitorOf } from "./visitor.ts";
import type { Options, Settings } from "./chat.ts";
import type { Config } from "./config.ts";
import type { CardFlow } from "./cards/flow.ts";
import type { TranslationFlow } from "./translations/flow.ts";
import type { makeQueue } from "./moderation/queue.ts";
import type { Stream } from "./stream/stream.ts";
import type { Present } from "./worlds/present.ts";
import { ircLink, type Link, type Said } from "./irc/link.ts";
import type { makeProgress } from "./moderation/catchup.ts";
import type { pinsFor } from "./pins/wire.ts";
import { typedRooms, type reconcilerFor } from "./rooms/wire.ts";

/** Each world's main room and its roles file's typed rooms, made in the database. */
export function seedRooms(db: DatabaseSync, settings: Settings, now: number): void {
  ensureRooms(db, [...settings.worlds.keys()], now);
  ensureNamed(db, typedRooms(settings.worlds), now);
}

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
  cards: { redacted: (room: string, msgid: string) => void } | undefined;
  translations: { redacted: (room: string, msgid: string) => void } | undefined;
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
  cards,
  translations,
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
      // Before the index drops its row, which holds the edits' ids a translation is found by.
      translations?.redacted(room, msgid);
      kept.hooks.onRedact(room, msgid);
      recent.taken(room, msgid);
      cards?.redacted(room, msgid);
    },
    onChannels: unknownChannels(db, log),
    onMessage,
    log,
  });
}

/** What an owner's hide and mute do (D13936): the link's REDACT with a word of ours, the mute that ends none, a world's rooms. */
export const ownerActs = (
  db: DatabaseSync,
  send: (command: Command, params: readonly string[]) => boolean,
  { muteKeeping }: Pick<Mutes, "muteKeeping">,
) => ({
  hide: (room: string, msgid: string): boolean => send("REDACT", [room, msgid, "hidden by a moderator of this world"]),
  muteKeeping,
  roomsOf: (world: string): readonly string[] => worldRooms(db, world),
});

/** The chat's stop: its timers cleared, nothing more started, the link and the queue let go, the stream closed. A line left waiting is caught up at the next start. */
export const stopper =
  ({
    timers,
    sweep,
    present,
    queue,
    cards,
    translations,
    link,
    stream,
  }: {
    timers: readonly ReturnType<typeof setInterval>[];
    sweep: () => void;
    present: Present | undefined;
    queue: Pick<ReturnType<typeof makeQueue>, "stop" | "idle">;
    cards: CardFlow | undefined;
    translations: Pick<TranslationFlow, "stop" | "idle"> | undefined;
    link: () => Link | undefined;
    stream: Stream;
  }) =>
  async (): Promise<void> => {
    for (const timer of timers) clearInterval(timer);
    sweep();
    present?.stop();
    queue.stop();
    cards?.stop();
    translations?.stop();
    await link()?.stop();
    await queue.idle();
    await cards?.idle();
    await translations?.idle();
    stream.close();
  };
