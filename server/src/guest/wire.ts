// The guest chat as the chat starts it (D430): the routes, with the bot's relay, the rooms' rules and the activity they feed.
import type { DatabaseSync } from "node:sqlite";
import type { Hono } from "hono";
import type { Activity } from "../activity/activity.ts";
import type { Config } from "../config.ts";
import type { Guarded } from "../guard.ts";
import type { Said } from "../irc/lines.ts";
import type { Link } from "../irc/link.ts";
import type { Answer } from "../moderation/provider.ts";
import type { Rules } from "../roles/roles.ts";
import { guestSaid } from "../rooms/earth.ts";
import { roomWorld } from "../rooms/rooms.ts";
import type { Typed } from "../rooms/types.ts";
import type { Log } from "@gnoworld/service/log";
import { guestAccess } from "./access.ts";
import { guestFrom } from "./routes.ts";

export interface GuestSettings extends Typed {
  moderation: Config["moderation"];
  origins: readonly string[];
  trustedProxy?: string | undefined;
  guests: Config["guests"];
  defaults?: Rules | undefined;
}

interface Parts {
  log: Log;
  pepper: string;
  now: () => number;
  session?: (token: string | undefined) => string | undefined;
  // OpenAI's check behind the server's one breaker (checker.ts's providerOf), shared with the lines' and the names' checks.
  provider: ((text: string) => Promise<Answer | "unchecked">) | undefined;
  // The recent lines' keeper: a relayed line is kept there under the id Ergo gave it.
  passed: (said: Said) => void;
  activity: Activity;
  archived: (room: string) => boolean;
  link: () => Link | undefined;
}

/** What the chat's start takes of the settings for the guest chat: the sites a POST may come from, its limits, the defaults. */
export const guestSettings = (config: Pick<Config, "origins" | "guests">, roles: { defaults?: Rules | undefined }) => ({
  origins: config.origins,
  guests: config.guests,
  defaults: roles.defaults,
});

function guestRoutes(db: DatabaseSync, settings: GuestSettings, parts: Parts): Hono<Guarded> {
  const { log, pepper, now, session = () => undefined, activity, archived, link } = parts;
  const { moderation, trustedProxy, defaults } = settings;
  const saying = guestSaid(db);
  return guestFrom(
    db,
    { origins: [...settings.origins], trustedProxy, guests: settings.guests, moderation },
    {
      log,
      pepper,
      now,
      session,
      access: guestAccess(settings, archived),
      worldOf: (room) => roomWorld(db, room),
      rulesOf: (world) => settings.worlds.get(world)?.rules,
      defaults,
      provider: parts.provider,
      relay: (room, nick, text) => link()?.relay(room, nick, text) ?? Promise.resolve(false),
      counted: (room, name, at) => {
        activity.countGuest(room, name, at);
        saying(room, at);
      },
      passed: parts.passed,
    },
  );
}

/** The guest chat's routes for the chat's start, none when its settings do not name the limits. */
export function guestFor(
  db: DatabaseSync,
  settings: Typed & Partial<GuestSettings>,
  parts: Parts,
): { guest?: Hono<Guarded> } {
  const { guests, moderation, origins } = settings;
  if (guests === undefined || moderation === undefined) return {};
  return { guest: guestRoutes(db, { ...settings, guests, moderation, origins: origins ?? [] }, parts) };
}
