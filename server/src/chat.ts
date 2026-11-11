// The chat's server side as main starts it (slice 3's plan, 3h to 3m): each world's main room and the
// roles file's typed rooms made, the IRC link in them when Ergo is set, each room kept as its type says,
// their activity counted, and each message checked by its world's rules and OpenAI (a members room's by
// its rules alone), through a fair queue, then acted on, streamed, and struck toward a mute; the routes
// that tell the activity, the rooms by section and the verdicts, each room's to whom may see it.
import type { DatabaseSync } from "node:sqlite";
import type { Presence } from "@gnoworld/schemas/indexer";
import type { Hono } from "hono";
import { makeActivity } from "./activity/activity.ts";
import { makeRecentLines, type RecentLines } from "./door/lines.ts";
import { activityRoutes } from "./activity/routes.ts";
import type { Config } from "./config.ts";
import type { Said } from "./irc/link.ts";
import type { Command } from "./irc/lines.ts";
import type { Log } from "@gnoworld/service/log";
import type { CardFlow } from "./cards/flow.ts";
import { cardsFlow, thenCards, type ChatCards } from "./cards/wire.ts";
import { makeProgress } from "./moderation/catchup.ts";
import { checkerFor, nameCheckerFor, providerOf, strikesFor } from "./moderation/checker.ts";
import type { Answer } from "./moderation/provider.ts";
import { makeQueue } from "./moderation/queue.ts";
import { moderate } from "./moderation/way.ts";
import type { Pins } from "./pins/pins.ts";
import { pinsFor } from "./pins/wire.ts";
import { ensureNamed, ensureRooms } from "./rooms/rooms.ts";
import { makeRooms, type Rooms } from "./rooms/create.ts";
import { listRoutes } from "./rooms/list.ts";
import { mayRead, publicRoom, type World } from "./rooms/types.ts";
import { linkFor, listedTo, ownerActs, stopper, verdictsFor } from "./chatParts.ts";
import { hearing, presentFor, presentOf } from "./chatHearing.ts";
import { guestFor, type GuestSettings } from "./guest/wire.ts";
import type { Search } from "./search/index.ts";
import { indexing } from "./search/wire.ts";
import { passedLines, type Signals } from "./signals/signals.ts";
import { makeStream, type Stream } from "./stream/stream.ts";
import { keeping, reconcilerFor, sweeping, typedRooms } from "./rooms/wire.ts";
import type { ChatWorld } from "./worlds/present.ts";

export interface Chat extends ReturnType<typeof guestFor> {
  activity: Hono;
  // A world's rooms by section, to whom may see them (4b).
  roomList: Hono;
  stream: Hono;
  // The verdicts of lines older than the stream's replay (4g).
  verdicts: Hono;
  // The moderators' rooms (3l), made and archived through the link.
  rooms: Rooms;
  // A room's name checked as a message of its world is (D394), for the Earth's public rooms.
  nameCheck: ReturnType<typeof nameCheckerFor>;
  // Each room's pins (4d), kept in the database: read from Ergo by their lines' ids, dropped as their lines leave.
  pins: Pins;
  // The link cards (slice 13): none unless they are on; what the routes serve and the retention expires.
  cards: CardFlow | undefined;
  // Whether an account may pin in a room: its world's moderators and the team.
  mayPin: (room: string, who: string) => boolean;
  // An owner's moderation (D13936): a line hidden by the link's REDACT, a mute that ends none, a world's rooms.
  hide: (room: string, msgid: string) => boolean;
  muteKeeping: (account: string, world: string) => "muted" | "already" | "full";
  roomsOf: (world: string) => readonly string[];
  // Whether an account, or a guest (undefined), may read a room: the stream's rule, for the pins' route (4d).
  mayRead: (room: string, who: string | undefined) => boolean;
  // Who is here in each world (7h), where the server keeps its history, and what that route serves, for the ticker's trends (7t).
  presence?: Hono;
  presenceNow?: () => Presence;
  // Each world's rooms with their usual, for the trends' score (7t3).
  presenceChat?: () => readonly ChatWorld[];
  // A public room's last lines moderation let through, for Jarvis's door (10g), and one by its id (10k).
  recent: RecentLines["recent"];
  line: RecentLines["line"];
  // A room's last line's id, any room (D13985).
  last: RecentLines["last"];
  stop: () => Promise<void>;
}

export interface Settings extends Partial<Pick<GuestSettings, "origins" | "guests" | "defaults">> {
  // Each world's rules, and since 3m its moderators, groups and typed rooms (rooms/types.ts).
  worlds: ReadonlyMap<string, World>;
  team?: ReadonlySet<string> | undefined;
  ergo: Config["ergo"];
  moderation: Config["moderation"];
  trustedProxy?: string | undefined;
  // Whom the automatic mute spares: the roles file's team and trusted (roles.ts's spared).
  spared?: (account: string) => boolean;
}

export interface Options {
  log: Log;
  pepper: string;
  now?: () => number;
  // The provider OpenAI's client stands for, given by the tests.
  provider?: (text: string) => Promise<Answer | "unchecked">;
  // How often ended mutes are lifted.
  tickMs?: number;
  // How often the Earth's public rooms nobody writes in are archived (D394).
  sweepMs?: number;
  // How often every room is read from Ergo and put back as its type says (3m).
  reconcileMs?: number;
  // The account of a session's token (login.ts's session), for the rooms a reader may see.
  session?: (token: string | undefined) => string | undefined;
  // The page's stream, made by the caller when the first signals' routes tell on it too (slice 9h); its own otherwise.
  stream?: Stream;
  // The first signals' store (slice 9h): with it, the first line of a public room that passed moderation is recorded and
  // told on the stream; without it, none is.
  signals?: Signals | undefined;
  // The search index (slice 13): the lines that pass moderation, a guest's among them, enter it, a REDACT or the room's join keeps it true.
  search?: Search | undefined;
  // Link cards (slice 13, L3): the link reader's call and the card's thresholds; none, no card.
  cards?: ChatCards | undefined;
  // How long after a refused hide (the line not yet in Ergo's history) it is asked again (F2462).
  redactRetryMs?: number;
  // The file who-is-here keeps its history in (7h); none keeps none.
  presence?: string;
  // What the lines that pass tell Jarvis's door (D13985): the account of each, and the room of a line taken or edited.
  door?: { heard: { said: (account: string) => void }; changed: (room: string) => void };
}

// A world's rooms at most, its main room aside (3l).
const ROOMS_PER_WORLD = 20;

// The stream's routes, for whom may read each room.
const streamFor = (stream: ReturnType<typeof makeStream>, settings: Settings, { session }: Options) =>
  stream.routes({ proxy: settings.trustedProxy, visible: (room, who) => mayRead(settings, room, who), session });

export function startChat(db: DatabaseSync, settings: Settings, options: Options): Chat {
  const { log, pepper, now = Date.now } = options;
  ensureRooms(db, [...settings.worlds.keys()], now());
  ensureNamed(db, typedRooms(settings.worlds), now());
  // One provider behind one breaker for the lines, the rooms' names and the guests' lines.
  const ask = providerOf(settings, { ...options, now });
  const check = checkerFor(db, settings, { ...options, ask });
  const stream = options.stream ?? makeStream();
  const progress = makeProgress(db);
  const send = (command: Command, params: readonly string[]): boolean => link?.send(command, params) ?? false;
  const { mutes, strike } = strikesFor(db, settings, { send, pepper, now });
  const recent = makeRecentLines({ isPublic: (room) => publicRoom(settings, room), ...options.door });
  // Every line the bot passed, the guests' relayed ones too, goes to the recent lines and to the index (F13700).
  const index = indexing(options.search, log, { recent, link: () => link });
  const passed = passedLines({ roles: settings, recent: index.recent, stream, signals: options.signals });
  // The link cards, once a line has passed: their flow checks the card behind the chat's one breaker.
  const cards = cardsFlow({ db, roles: settings, pepper, log, now, stream, ask, cards: options.cards });
  const run = moderate({ db, check, send, stream, progress, strike, passed: thenCards(passed, cards) });
  const queue = makeQueue<Said>({ run, log, now });
  const keeper = makeRooms({ db, send, now, max: ROOMS_PER_WORLD });
  const lifts = setInterval(mutes.tick, options.tickMs ?? 10_000);
  const activity = makeActivity();
  const visible = listedTo(settings, keeper);
  const present = presentFor(db, options.presence, { visible, activity, stream, log, now });
  const reconciler = reconcilerFor(db, settings, {
    seen: present?.seen,
    keeper,
    send,
    state: (room) => link?.state(room) ?? Promise.resolve(undefined),
    log,
  });
  const passes = setInterval(reconciler.ask, options.reconcileMs ?? 60_000);
  const rooms = keeping(keeper, { mutes, reconciler });
  const stopSweeping = sweeping(db, rooms, { now, ms: options.sweepMs ?? 60 * 60_000, roles: settings });
  const kept = pinsFor(db, settings, { link: () => link, now, log, maker: keeper.maker });
  const onMessage = hearing({ kept, cards, recent, activity, present, visible, progress, queue, now });
  const parts = {
    db,
    ergo: settings.ergo,
    redactRetryMs: options.redactRetryMs,
    progress,
    queue,
    reconciler,
    mutes,
    log,
    onMessage,
  };
  const link = linkFor({ ...parts, cards, kept: index.kept(kept), recent: index.recent });
  return {
    ...guestFor(db, settings, {
      ...options,
      log,
      pepper,
      now,
      provider: ask,
      passed: index.recent.passed,
      activity,
      archived: keeper.archived,
      link: () => link,
    }),
    activity: activityRoutes(activity, { db, now, visible, session: options.session }),
    roomList: listRoutes({ db, roles: settings, visible, session: options.session, here: present?.here, now }),
    stream: streamFor(stream, settings, options),
    verdicts: verdictsFor(db, settings, options),
    rooms,
    nameCheck: nameCheckerFor(settings, { ...options, ask }),
    ...kept.api,
    cards,
    ...presentOf(present),
    recent: recent.recent,
    line: recent.line,
    last: recent.last,
    ...ownerActs(db, send, mutes),
    stop: stopper({ timers: [lifts, passes], sweep: stopSweeping, present, queue, cards, link: () => link, stream }),
  };
}
