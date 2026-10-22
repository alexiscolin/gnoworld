// The chat's server side as main starts it (slice 3's plan, 3h, 3i): each world's main room made, the IRC
// link in them when Ergo is set, their activity counted, and each message checked by its world's rules
// and OpenAI, through a fair queue; the route that tells the activity.
import type { DatabaseSync } from "node:sqlite";
import type { Hono } from "hono";
import { makeActivity } from "./activity/activity.ts";
import { activityRoutes } from "./activity/routes.ts";
import type { Config } from "./config.ts";
import { ircLink, type Said } from "./irc/link.ts";
import type { Log } from "./log.ts";
import { makeChecker } from "./moderation/check.ts";
import { moderationClient, type Answer } from "./moderation/provider.ts";
import { makeQueue } from "./moderation/queue.ts";
import type { Rules } from "./roles/roles.ts";
import { ensureRooms, listRooms, roomWorld } from "./rooms/rooms.ts";

export interface Chat {
  routes: Hono;
  stop: () => Promise<void>;
}

interface Settings {
  worlds: ReadonlyMap<string, { rules: Rules }>;
  ergo: Config["ergo"];
  moderation: Config["moderation"];
}

interface Options {
  log: Log;
  pepper: string;
  now?: () => number;
  // The provider OpenAI's client stands for, given by the tests.
  provider?: (text: string) => Promise<Answer | "unchecked">;
}

export function startChat(db: DatabaseSync, { worlds, ergo, moderation }: Settings, options: Options): Chat {
  const { log, pepper, now = Date.now } = options;
  ensureRooms(db, [...worlds.keys()], now());
  const key = moderation.openaiKey;
  if (key === undefined && options.provider === undefined) log("alert", { error: "moderation_off" });
  const check = makeChecker({
    db,
    rulesOf: (room) => worlds.get(roomWorld(db, room) ?? "")?.rules,
    provider: options.provider ?? (key === undefined ? undefined : moderationClient({ key: key.reveal(), log })),
    thresholds: moderation.thresholds,
    pepper,
    log,
    now,
    newAccountMs: moderation.newAccountHours * 60 * 60_000,
  });
  const queue = makeQueue<Said>({
    run: async (said) => {
      await check(said);
    },
    log,
    now,
  });
  const activity = makeActivity();
  const link =
    ergo === undefined
      ? undefined
      : ircLink({
          ...ergo,
          rooms: () => listRooms(db).map(({ name }) => name),
          onMessage: (said) => {
            activity.count(said.room, said.account, now());
            queue.push(said);
          },
          log,
        });
  return {
    routes: activityRoutes(activity, { db, now }),
    stop: async () => {
      await link?.stop();
      queue.stop();
      await queue.idle();
    },
  };
}
