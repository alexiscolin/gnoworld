// The link cards' routes (docs/plans/link-previews.md §3 steps 5 and 6; §4 "Removal abuse"): GET /api/cards for the cards of lines older than
// the stream's replay, GET /api/cards/<key> and its /picture for a card's content, POST /api/cards/remove. None of the GETs fetches: the
// routes hold no reader at all. The right to remove is the line's author, or whoever may pin in its room, as the pins' route has it.
import { createHash } from "node:crypto";
import { CardRemove, RoomId, VerdictId, VERDICTS_ASKED, type Address, type LinkCard } from "@gnoworld/schemas";
import type { Log } from "@gnoworld/service/log";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { baseRefusals, guard, json, refuserOf, sessionOf, type Guarded, type Refusals } from "../guard.ts";
import { limiter } from "../limit.ts";
import { mayWithin } from "../pins/routes.ts";
import type { Right } from "../roles/mayModerate.ts";
import { once } from "../stream/stream.ts";
import { visitorOf } from "../visitor.ts";
import type { CardFlow } from "./flow.ts";

// A visitor's lines' requests a minute (as the verdicts'); its card and picture reads, which a page of 30 cards spends 60 of; an account's removals.
const LINES_PER_MINUTE = 60;
const READS_PER_MINUTE = 600;
const REMOVALS_PER_MINUTE = 30;

export interface CardRoutesOptions {
  cards: Pick<CardFlow, "lines" | "content" | "picture" | "known" | "isAuthor" | "remove">;
  /** Who may pin in the room, owners included (async, as the pins' route takes it). */
  mayPin: (room: string, who: string, visitor: string) => Promise<Right | false>;
  readable: (room: string, who: string | undefined) => boolean;
  session: (token: string | undefined) => Address | undefined;
  proxy?: string | undefined;
  origins: readonly string[];
  log: Log;
  now: () => number;
}

const refusals = {
  ...baseRefusals,
  forbidden: ["forbidden", 403],
  not_found: ["not_found", 404],
} as const satisfies Refusals;

const Ids = z
  .string()
  .transform((list) => list.split(","))
  .pipe(z.array(VerdictId).min(1).max(VERDICTS_ASKED));
const KEY = /^[0-9a-f]{64}$/;
const tag = (body: string | Uint8Array): string => `"${createHash("sha256").update(body).digest("hex").slice(0, 32)}"`;

export function cardsRoutes({
  cards,
  mayPin,
  readable,
  session,
  proxy,
  origins,
  log,
  now,
}: CardRoutesOptions): Hono<Guarded> {
  const perMinute = (max: number) => limiter({ max, windowMs: 60_000, keys: 100_000 });
  const [lines, reads, removals] = [
    perMinute(LINES_PER_MINUTE),
    perMinute(READS_PER_MINUTE),
    perMinute(REMOVALS_PER_MINUTE),
  ];
  const refuse = refuserOf(log, "card_refused", refusals);
  const account = (c: Context): Address | undefined => sessionOf(c, session);
  // An answer the reader may keep and ask again with its ETag; a card comes and goes with its lines, so never kept unasked.
  const tagged = (c: Context, body: string | Uint8Array, type: string): Response => {
    const etag = tag(body);
    c.header("cache-control", "no-cache");
    c.header("etag", etag);
    return c.req.header("if-none-match") === etag
      ? c.body(null, 304)
      : c.body(typeof body === "string" ? body : Uint8Array.from(body), 200, {
          "content-type": type,
          "x-content-type-options": "nosniff",
        });
  };
  const read = (c: Context, key: string) => {
    if (!reads.take(visitorOf(c, proxy), now())) return refuse(c, "limit");
    return KEY.test(key) ? undefined : refuse(c, "not_found");
  };

  const app = new Hono<Guarded>();
  app.use(guard(origins, refuse));

  app.get("/", (c) => {
    if (!lines.take(visitorOf(c, proxy), now())) return refuse(c, "limit");
    const room = RoomId.safeParse(once(c.req.queries("room")));
    const ids = Ids.safeParse(once(c.req.queries("ids")));
    if (!room.success || !ids.success) return refuse(c, "body");
    if (!readable(room.data, account(c))) return refuse(c, "forbidden", { room: room.data });
    return c.json({ room: room.data, cards: cards.lines(room.data, [...new Set(ids.data)]) });
  });

  app.get("/:key", (c) => {
    const key = c.req.param("key");
    const refused = read(c, key);
    if (refused !== undefined) return refused;
    const card: LinkCard | undefined = cards.content(key);
    return card === undefined ? refuse(c, "not_found") : tagged(c, JSON.stringify(card), "application/json");
  });

  app.get("/:key/picture", (c) => {
    const key = c.req.param("key");
    const refused = read(c, key);
    if (refused !== undefined) return refused;
    const picture = cards.picture(key);
    return picture === undefined ? refuse(c, "not_found") : tagged(c, picture, "image/jpeg");
  });

  app.post("/remove", async (c) => {
    const who = account(c);
    if (who === undefined) return refuse(c, "session");
    const body = CardRemove.safeParse(await json(c));
    if (!body.success) return refuse(c, "body");
    const { room, msgid } = body.data;
    if (!removals.take(who, now())) return refuse(c, "limit", { room });
    if (!cards.known(room, msgid)) return refuse(c, "not_found", { room });
    // The author needs no chain read; anyone else's right is read within a bound and fails closed.
    const may = cards.isAuthor(room, msgid, who) || (await mayWithin(mayPin(room, who, visitorOf(c, proxy))));
    if (!may) return refuse(c, "forbidden", { room });
    if (!cards.remove(room, msgid)) return refuse(c, "not_found", { room });
    log("card_removed", { room, msgid, account: who });
    return c.json({ room, msgid, key: null });
  });
  return app;
}
