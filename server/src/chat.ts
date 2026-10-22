// The chat's server side as main starts it (slice 3's plan, 3h): each world's main room made, the IRC link
// in them when Ergo is set, their activity counted from what it reads, and the route that tells it.
import type { DatabaseSync } from "node:sqlite";
import type { Hono } from "hono";
import { makeActivity } from "./activity/activity.ts";
import { activityRoutes } from "./activity/routes.ts";
import type { Config } from "./config.ts";
import { ircLink } from "./irc/link.ts";
import type { Log } from "./log.ts";
import { ensureRooms, listRooms } from "./rooms/rooms.ts";

export interface Chat {
  routes: Hono;
  stop: () => Promise<void>;
}

export function startChat(
  db: DatabaseSync,
  { worlds, ergo }: { worlds: readonly string[]; ergo: Config["ergo"] },
  { log, now = Date.now }: { log: Log; now?: () => number },
): Chat {
  ensureRooms(db, worlds, now());
  const activity = makeActivity();
  const link =
    ergo === undefined
      ? undefined
      : ircLink({
          ...ergo,
          rooms: () => listRooms(db).map(({ name }) => name),
          onMessage: ({ room, account }) => {
            activity.count(room, account, now());
          },
          log,
        });
  return { routes: activityRoutes(activity, { db, now }), stop: async () => link?.stop() };
}
