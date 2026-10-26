// GET /api/verdicts?room=<room>&ids=<msgid,...> (slice 4's 4g; docs/decisions.md, 2026-10-26): the latest verdict of
// each line asked, for the lines a page shows older than the stream's replay. Answered for a room the reader may
// read alone, as the stream and GET /api/rooms are (3m); a visitor's requests limited, refused ones counted.
import type { DatabaseSync } from "node:sqlite";
import { type ApiError, LineVerdicts, type StreamEvent, VerdictId, VERDICTS_ASKED } from "@gnoworld/schemas";
import { Hono, type Context } from "hono";
import { getCookie } from "hono/cookie";
import { z } from "zod";
import { limiter } from "../limit.ts";

/** A visitor's requests a minute. */
export const VERDICTS_PER_MINUTE = 60;

interface Options {
  db: DatabaseSync;
  // Whether an account, or a guest (undefined), may read the room's lines: no default, so none is open by mistake.
  readable: (room: string, who: string | undefined) => boolean;
  // The account of a session's token (login.ts's session).
  session: (token: string | undefined) => string | undefined;
  // The visitor a limit counts, from the request (visitor.ts behind the proxy).
  visitor: (c: Context) => string;
  now: () => number;
}

// The room as the stream takes it, and the ids: msgids, one word each, at most VERDICTS_ASKED.
const Room = z.string().regex(/^#[^\s,#\0-\x1f\x7f]{1,63}$/);
const Ids = z
  .string()
  .transform((list) => list.split(","))
  .pipe(z.array(VerdictId).min(1).max(VERDICTS_ASKED));
// The stream's states, from the bot's actions: an unchecked or pending line has none (chat.ts's moderate).
const STATES: Readonly<Record<string, StreamEvent["state"]>> = { pass: "checked", hide: "hidden" };

export function verdictRoutes({ db, readable, session, visitor, now }: Options): Hono {
  const limit = limiter({ max: VERDICTS_PER_MINUTE, windowMs: 60_000, keys: 100_000 });
  const app = new Hono();
  app.get("/", (c) => {
    if (!limit.take(visitor(c), now())) return c.json({ error: "too_many" } satisfies ApiError, 429);
    const [rooms = [], lists = []] = [c.req.queries("room"), c.req.queries("ids")];
    const room = Room.safeParse(rooms.length === 1 ? rooms[0] : undefined);
    const ids = Ids.safeParse(lists.length === 1 ? lists[0] : undefined);
    if (!room.success || !ids.success) return c.json({ error: "refused" } satisfies ApiError, 400);
    if (!readable(room.data, session(getCookie(c, "__Host-session")))) {
      return c.json({ error: "forbidden" } satisfies ApiError, 403);
    }
    const asked = [...new Set(ids.data)];
    const rows = db
      .prepare(`SELECT msgid, action FROM verdicts WHERE room = ? AND msgid IN (${asked.map(() => "?").join(",")})`)
      .all(room.data, ...asked);
    const stateOf = (action: string) => (Object.hasOwn(STATES, action) ? STATES[action] : undefined);
    const held = new Map(rows.map((row) => [String(row["msgid"]), stateOf(String(row["action"]))]));
    const verdicts = asked.flatMap((msgid) => {
      const state = held.get(msgid);
      return state === undefined ? [] : [{ msgid, state }];
    });
    // A verdict changes as the bot settles a line: no cache keeps an old one.
    c.header("cache-control", "no-store");
    return c.json({ room: room.data, verdicts } satisfies LineVerdicts);
  });
  return app;
}
