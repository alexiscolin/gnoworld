// GET /api/unread and POST /api/unread: an account's reading places in, its worlds' unread counts out. Both answer the session's account
// alone: the address is never in the body, which a stray key refuses whole. A place past the clock is dropped, the rest of its call kept.
import { type Address, type Unread as Counts, UnreadPlaces } from "@gnoworld/schemas";
import type { Log } from "@gnoworld/service/log";
import { Hono } from "hono";
import { baseRefusals, guard, json, refuserOf, sessionOf, type Guarded } from "../guard.ts";
import { limiter } from "../limit.ts";
import { remember } from "../remember.ts";
import type { Unread } from "./store.ts";

/** An account's calls a minute: its counts, and its places (a page posts one every 5 s, so 12 a minute; 30 leaves room for reloads). */
const COUNTS_PER_MINUTE = 60;
const PLACES_PER_MINUTE = 30;
/** Place writes a second across every account: the index is one synchronous connection, so per-account limits do not bound its load (F13770). */
const PLACES_PER_SECOND = 20;
/** How long an account's count is kept before it is made again. */
const KEPT_MS = 5_000;
const KEPT_ACCOUNTS = 10_000;

export interface UnreadRoutesOptions {
  unread: Unread;
  session: (token: string | undefined) => Address | undefined;
  origins: readonly string[];
  log: Log;
  now: () => number;
  /** Place writes a second across all accounts (default PLACES_PER_SECOND). */
  perSecond?: number;
}

export function unreadRoutes({
  unread,
  session,
  origins,
  log,
  now,
  perSecond = PLACES_PER_SECOND,
}: UnreadRoutesOptions): Hono<Guarded> {
  const perMinute = (max: number) => limiter({ max, windowMs: 60_000, keys: 100_000 });
  const [reads, writes] = [perMinute(COUNTS_PER_MINUTE), perMinute(PLACES_PER_MINUTE)];
  const together = limiter({ max: perSecond, windowMs: 1000, keys: 1 });
  const refuse = refuserOf(log, "unread_refused", baseRefusals);
  const kept = new Map<string, { at: number; counts: Counts }>();
  const app = new Hono<Guarded>();
  app.use(guard(origins, refuse));

  app.get("/", (c) => {
    const who = sessionOf(c, session);
    if (who === undefined) return refuse(c, "session");
    if (!reads.take(who, now())) return refuse(c, "limit");
    const held = kept.get(who);
    if (held !== undefined && now() - held.at < KEPT_MS) return c.json(held.counts);
    const counts: Counts = { worlds: unread.counts(who) };
    remember(kept, [who, { at: now(), counts }], KEPT_ACCOUNTS);
    return c.json(counts);
  });

  app.post("/", async (c) => {
    const who = sessionOf(c, session);
    if (who === undefined) return refuse(c, "session");
    if (!writes.take(who, now()) || !together.take("all", now())) return refuse(c, "limit");
    const body = UnreadPlaces.safeParse(await json(c));
    if (!body.success) return refuse(c, "body");
    unread.places(
      who,
      body.data.places.map(({ room, time }) => ({ room, time: Date.parse(time) })),
    );
    kept.delete(who);
    return c.body(null, 204);
  });
  return app;
}
