// POST /api/guest and POST /api/guest/say (D430): a name and a cookie, then a line the server judges before the bot says it.
// An account never takes a guest's name: its login session wins on both routes. GUEST_CHAT=off answers 404 to both, doing nothing.
import type { DatabaseSync } from "node:sqlite";
import { GuestSayRequest, type ApiError, type Guest as GuestAnswer, type GuestSaid } from "@gnoworld/schemas";
import { Hono, type Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import type { Config } from "../config.ts";
import { guard, json, type Guarded } from "../guard.ts";
import { limiter } from "../limit.ts";
import { accountKey } from "../moderation/check.ts";
import { visitor48Of, visitorOf } from "../visitor.ts";
import type { Log } from "@gnoworld/service/log";
import { makeGuests, NamesTaken } from "./guests.ts";
import { makeGuestMutes } from "./mutes.ts";
import { makeSay, type SayDeps } from "./say.ts";

export type Settings = Pick<Config, "origins" | "trustedProxy" | "guests"> & {
  moderation: { thresholds: Config["moderation"]["thresholds"]; mute: Omit<Config["moderation"]["mute"], "max"> };
};

export interface Outside extends Omit<SayDeps, "now" | "log" | "mutes" | "thresholds"> {
  log: Log;
  pepper: string;
  now?: () => number;
  random?: (bytes: number) => Uint8Array;
  /** The account a login session's cookie holds: an account never takes a guest's name. */
  session: (token: string | undefined) => string | undefined;
}

type Status = 400 | 401 | 403 | 415 | 429 | 503;
const Body = z.looseObject({});

export function guestFrom(db: DatabaseSync, settings: Settings, outside: Outside): Hono<Guarded> {
  const { origins, trustedProxy, guests: limits, moderation } = settings;
  const { log, pepper, now = Date.now, session } = outside;
  const guests = makeGuests(db, { now, ...(outside.random === undefined ? {} : { random: outside.random }) });
  const mutes = makeGuestMutes(db, { now, mute: moderation.mute });
  const say = makeSay({ ...outside, now, mutes, thresholds: moderation.thresholds });
  const perVisitor = limiter({ max: limits.perVisitor, windowMs: 60 * 60_000, keys: 100_000 });
  // The /48 is one customer at most providers: sixty /64s of it take no more than four times one visitor's names.
  const perBucket = limiter({ max: 4 * limits.perVisitor, windowMs: 60 * 60_000, keys: 100_000 });
  const inAll = limiter({ max: limits.perHour, windowMs: 60 * 60_000, keys: 1 });
  // __Host-: sent only to the host that set it, over HTTPS, for every path. No Max-Age: it lasts the browser's visit.
  const cookie = "__Host-guest";
  const options = { path: "/", httpOnly: true, secure: true, sameSite: "Strict" } as const;
  const answer = (c: Context, error: ApiError["error"], status: Status): Response => {
    log("guest_refused", { status, error });
    return c.json({ error }, status);
  };
  // The visitor strikes and mutes key on: its /48, hashed, never the address.
  const bucketOf = (c: Context): string => accountKey(pepper, visitor48Of(c, trustedProxy));
  const app = new Hono<Guarded>();
  app.use(async (c, next) => (limits.on ? next() : c.json({ error: "not_found" } satisfies ApiError, 404)));
  app.use(
    guard(origins, (c, cause) => (cause === "origin" ? answer(c, "forbidden", 403) : answer(c, "unsupported", 415))),
  );
  // An account's session wins, whatever guest cookie it also holds: an account speaks as itself, never as anon/.
  app.use(async (c, next) =>
    session(getCookie(c, "__Host-session")) === undefined ? next() : answer(c, "forbidden", 403),
  );

  app.post("/", async (c) => {
    if (!Body.safeParse(await json(c)).success) return answer(c, "refused", 400);
    const held = guests.byToken(getCookie(c, cookie));
    if (held !== undefined) return c.json({ name: held.name } satisfies GuestAnswer);
    const who = bucketOf(c);
    if (mutes.mutedAnywhere(who)) {
      log("guest_refused", { status: 403, reason: "muted" });
      return c.json({ error: "forbidden", cause: "muted" }, 403);
    }
    const [own, wide, at] = [visitorOf(c, trustedProxy), visitor48Of(c, trustedProxy), now()];
    // Every allowance is looked at, then every one is taken: a try refused spends nothing.
    const asked = [
      [perVisitor, own],
      [perBucket, wide],
      [inAll, "all"],
    ] as const;
    if (asked.some(([each, key]) => each.full(key, at)) || guests.alive() >= limits.living)
      return answer(c, "too_many", 429);
    for (const [each, key] of asked) each.take(key, at);
    try {
      const made = guests.mint(who);
      setCookie(c, cookie, made.token, options);
      return c.json({ name: made.name } satisfies GuestAnswer);
    } catch (error) {
      if (error instanceof NamesTaken) return answer(c, "not_ready", 503);
      throw error;
    }
  });

  app.post("/say", async (c) => {
    const token = getCookie(c, cookie);
    const guest = guests.byToken(token);
    if (guest === undefined) return answer(c, "unauthenticated", 401);
    const body = GuestSayRequest.safeParse(await json(c));
    if (!body.success) return answer(c, "refused", 400);
    const reply = await say(guest, body.data.room, body.data.text);
    if (reply.status === 200) {
      // Only a line the relay took makes a guest used: a refusal, a rate or an unsure answer leaves its hour running.
      guests.use(token);
      return c.json({ ok: true } satisfies GuestSaid);
    }
    return c.json({ error: reply.error, ...(reply.cause === undefined ? {} : { cause: reply.cause }) }, reply.status);
  });
  return app;
}
