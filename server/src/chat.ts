// The chat's server side as main starts it (slice 3's plan, 3h to 3m): each world's main room and the
// roles file's typed rooms made, the IRC link in them when Ergo is set, each room kept as its type says,
// their activity counted, and each message checked by its world's rules and OpenAI (a members room's by
// its rules alone), through a fair queue, then acted on, streamed, and struck toward a mute; the routes
// that tell the activity, the rooms by section and the verdicts, each room's to whom may see it.
import type { DatabaseSync } from "node:sqlite";
import type { Hono } from "hono";
import { makeActivity } from "./activity/activity.ts";
import { activityRoutes } from "./activity/routes.ts";
import type { Config } from "./config.ts";
import { ircLink, type Link, type Said } from "./irc/link.ts";
import type { Command } from "./irc/lines.ts";
import type { Log } from "./log.ts";
import { act } from "./moderation/act.ts";
import { makeProgress, type Progress } from "./moderation/catchup.ts";
import { checkAgain, makeChecker, type Verdict } from "./moderation/check.ts";
import { makeMutes } from "./moderation/mute.ts";
import { moderationClient, type Answer } from "./moderation/provider.ts";
import { makeQueue } from "./moderation/queue.ts";
import { makeStrike } from "./moderation/strikes.ts";
import type { Pins } from "./pins/pins.ts";
import { pinsFor } from "./pins/wire.ts";
import { ensureNamed, ensureRooms, listRooms, roomWorld, worldRooms } from "./rooms/rooms.ts";
import { makeRooms, type Rooms } from "./rooms/create.ts";
import { listRoutes } from "./rooms/list.ts";
import { listed, mayRead, publicRoom, staffOf, type World } from "./rooms/types.ts";
import { getConnInfo } from "@hono/node-server/conninfo";
import { makeStream, stateOf, type Stream } from "./stream/stream.ts";
import { verdictRoutes } from "./stream/verdicts.ts";
import { visitor } from "./visitor.ts";
import { keeping, reconcilerFor, typedRooms } from "./rooms/wire.ts";

export interface Chat {
  activity: Hono;
  // A world's rooms by section, to whom may see them (4b).
  roomList: Hono;
  stream: Hono;
  // The verdicts of lines older than the stream's replay (4g).
  verdicts: Hono;
  // The moderators' rooms (3l), made and archived through the link.
  rooms: Rooms;
  // Each room's pins (4d), kept in the database: read from Ergo by their lines' ids, dropped as their lines leave.
  pins: Pins;
  // Whether an account may pin in a room: its world's moderators and the team.
  mayPin: (room: string, who: string) => boolean;
  // Whether an account, or a guest (undefined), may read a room: the stream's rule, for the pins' route (4d).
  mayRead: (room: string, who: string | undefined) => boolean;
  stop: () => Promise<void>;
}

interface Settings {
  // Each world's rules, and since 3m its moderators, groups and typed rooms (rooms/types.ts).
  worlds: ReadonlyMap<string, World>;
  team?: ReadonlySet<string> | undefined;
  ergo: Config["ergo"];
  moderation: Config["moderation"];
  trustedProxy?: string | undefined;
  // Whom the automatic mute spares: the roles file's team and trusted (roles.ts's spared).
  spared?: (account: string) => boolean;
}

interface Options {
  log: Log;
  pepper: string;
  now?: () => number;
  // The provider OpenAI's client stands for, given by the tests.
  provider?: (text: string) => Promise<Answer | "unchecked">;
  // How often ended mutes are lifted.
  tickMs?: number;
  // How often every room is read from Ergo and put back as its type says (3m).
  reconcileMs?: number;
  // The account of a session's token (login.ts's session), for the rooms a reader may see.
  session?: (token: string | undefined) => string | undefined;
}

interface Steps {
  db: DatabaseSync;
  check: (said: Said) => Promise<Verdict | "seen" | "busy">;
  send: (command: Command, params: readonly string[]) => boolean;
  stream: Stream;
  progress: Progress;
  strike: (said: Said) => void;
}

// A line's way once heard: checked, acted on, streamed and struck, then settled in its room's mark.
function moderate({ db, check, send, stream, progress, strike }: Steps): (said: Said) => Promise<void> {
  return async (said) => {
    let done = true;
    try {
      const verdict = await check(said);
      if (verdict === "seen") return;
      // Another run checks it now and settles it: settled here, the mark would pass a line not yet done.
      if (verdict === "busy") {
        done = false;
        return;
      }
      // A hide the link could not send: checked again when the catch-up brings the line back.
      done = act(said, verdict, { send });
      if (!done) checkAgain(db, said.msgid);
      // An unchecked line has no event: its previews wait.
      else {
        const state = stateOf(verdict.action);
        if (state !== undefined) stream.publish({ msgid: said.msgid, room: said.room, state });
        if (verdict.action === "hide") strike(said);
      }
    } finally {
      if (done) progress.settled(said);
    }
  };
}

// A world's rooms at most, its main room aside (3l).
const ROOMS_PER_WORLD = 20;

// The check of each line: its world's rules, then OpenAI when a key is set, or the alert that none is.
function checkerFor(db: DatabaseSync, { worlds, moderation }: Settings, options: Options): Steps["check"] {
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

// A channel in Ergo the server did not make: with operator-only-creation, an operator made it (3l).
const unknownChannels =
  (db: DatabaseSync, log: Log) =>
  (names: readonly string[]): void => {
    const known = new Set(listRooms(db).map(({ name }) => name));
    for (const room of names) if (!known.has(room)) log("alert", { error: "unknown_room", room });
  };

// The verdicts of lines older than the stream's replay, by the stream's own rule of who reads (4g).
function verdictsFor(db: DatabaseSync, settings: Settings, { session = () => undefined, now = Date.now }: Options) {
  return verdictRoutes({
    db,
    readable: (room, who) => mayRead(settings, room, who),
    session,
    visitor: (c) => visitor(getConnInfo(c).remote.address ?? "", c.req.header("x-real-ip"), settings.trustedProxy),
    now,
  });
}

export function startChat(db: DatabaseSync, settings: Settings, options: Options): Chat {
  const { worlds, ergo, moderation } = settings;
  const { log, pepper, now = Date.now } = options;
  ensureRooms(db, [...worlds.keys()], now());
  ensureNamed(db, typedRooms(worlds), now());
  const check = checkerFor(db, settings, options);
  const stream = makeStream();
  const progress = makeProgress(db);
  const send = (command: Command, params: readonly string[]): boolean => link?.send(command, params) ?? false;
  const { mute } = moderation;
  const mutes = makeMutes({
    db,
    send,
    roomsOf: (world) => worldRooms(db, world),
    now,
    forMs: mute.minutes * 60_000,
    max: mute.max,
  });
  const strike = makeStrike(db, { pepper, now, mute, mutes, spared: settings.spared ?? (() => false) });
  const queue = makeQueue<Said>({ run: moderate({ db, check, send, stream, progress, strike }), log, now });
  const keeper = makeRooms({ db, send, now, max: ROOMS_PER_WORLD });
  const lifts = setInterval(mutes.tick, options.tickMs ?? 10_000);
  const reconciler = reconcilerFor(db, settings, {
    keeper,
    send,
    state: (room) => link?.state(room) ?? Promise.resolve(undefined),
    log,
  });
  const passes = setInterval(reconciler.ask, options.reconcileMs ?? 60_000);
  const activity = makeActivity();
  const kept = pinsFor(db, settings, { link: () => link, now, log });
  const link: Link | undefined =
    ergo === undefined
      ? undefined
      : ircLink({
          ...ergo,
          rooms: () => listRooms(db).map(({ name }) => name),
          lastChecked: progress.last,
          drained: () => queue.idle(),
          onReady: () => {
            reconciler.flags();
            mutes.reapply();
            reconciler.ask();
          },
          onJoin: reconciler.joined,
          ...kept.hooks,
          onChannels: unknownChannels(db, log),
          onMessage: (said) => {
            kept.onEdit(said);
            activity.count(said.room, said.account, now());
            progress.heard(said);
            // A line the full queue drops is left unchecked, with the alert.
            if (!queue.push(said)) progress.settled(said);
          },
          log,
        });
  // Whom a room is listed to: an archived room is a hidden one.
  const visible = (room: string, who: string | undefined): boolean =>
    keeper.archived(room) ? staffOf(settings, room, who) : listed(settings, room, who);
  return {
    activity: activityRoutes(activity, { db, now, visible, session: options.session }),
    roomList: listRoutes({ db, roles: settings, visible, session: options.session }),
    stream: stream.routes({
      proxy: settings.trustedProxy,
      visible: (room, who) => mayRead(settings, room, who),
      session: options.session,
    }),
    verdicts: verdictsFor(db, settings, options),
    rooms: keeping(keeper, { mutes, reconciler }),
    ...kept.api,
    stop: async () => {
      clearInterval(lifts);
      clearInterval(passes);
      // Nothing more starts once stopping: a line left waiting is caught up at the next start.
      queue.stop();
      await link?.stop();
      await queue.idle();
      stream.close();
    },
  };
}
