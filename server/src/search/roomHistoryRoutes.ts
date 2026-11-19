// GET /api/history?room=: one public room's last lines, for anyone, so a page draws them before its link to Ergo has joined.
// The index's lines are the ones moderation let through, minus a REDACT, an edit in its last text. The room is open or an
// announcement room, listed, not hidden nor archived: the guest's right, whoever asks, so a cache may keep the answer.
import { createHash } from "node:crypto";
import { Address, ROOM_HISTORY_LINES, RoomId, type ApiError, type RoomHistory } from "@gnoworld/schemas";
import type { Log } from "@gnoworld/service/log";
import { type Context, Hono } from "hono";
import { limiter } from "../limit.ts";
import { worldOf } from "../rooms/rooms.ts";
import { mayRead, searchable, type Typed } from "../rooms/types.ts";
import { visitor48Of, visitorOf, VISITORS_PER_BLOCK } from "../visitor.ts";
import type { Search } from "./index.ts";

/** Requests a minute: a visitor, and an address block (four visitors'). */
const PER_MINUTE = 60;
/** Requests a second across every visitor: the index is one synchronous connection. */
const PER_SECOND = 50;
const KEEP_SECONDS = 5;

export interface Options {
  search: Pick<Search, "latest">;
  roles: Typed;
  archived: (room: string) => boolean;
  /** The rooms the server knows of a world. */
  rooms: (world: string) => readonly string[];
  proxy?: string | undefined;
  log: Log;
  now: () => number;
  keys?: number;
  perMinute?: number;
  perSecond?: number;
}

export function roomHistoryRoutes({
  search,
  roles,
  archived,
  rooms,
  proxy,
  log,
  now,
  keys = 100_000,
  perMinute = PER_MINUTE,
  perSecond = PER_SECOND,
}: Options): Hono {
  const byVisitor = limiter({ max: perMinute, windowMs: 60_000, keys });
  const byBlock = limiter({ max: VISITORS_PER_BLOCK * perMinute, windowMs: 60_000, keys });
  const together = limiter({ max: perSecond, windowMs: 1000, keys: 1 });
  const refuse = (c: Context, error: ApiError["error"], status: 400 | 404 | 429 | 503) => {
    log("history_refused", { status, error });
    c.header("cache-control", "no-store");
    return c.json({ error } satisfies ApiError, status);
  };
  // The guest's right, asked on every request: a room typed for accounts or members, hidden or archived is never served.
  const open = (room: string): boolean =>
    rooms(worldOf(room)).includes(room) &&
    searchable(roles, room) &&
    mayRead(roles, room, undefined) &&
    !archived(room);
  // A failing index (a locked or full database) is a 503, its name logged alone: a message may quote a line.
  const latest = (room: string): ReturnType<Search["latest"]> | undefined => {
    try {
      return search.latest(room, ROOM_HISTORY_LINES);
    } catch (error) {
      log("history_failed", { reason: error instanceof Error ? error.name : "unknown" });
      return undefined;
    }
  };
  const app = new Hono();
  app.get("/", (c) => {
    if (!byVisitor.take(visitorOf(c, proxy), now()) || !byBlock.take(visitor48Of(c, proxy), now()))
      return refuse(c, "too_many", 429);
    if (!together.take("all", now())) return refuse(c, "too_many", 429);
    const asked = RoomId.safeParse(c.req.queries("room")?.length === 1 ? c.req.query("room") : undefined);
    if (!asked.success) return refuse(c, "refused", 400);
    if (!open(asked.data)) return refuse(c, "not_found", 404);
    const found = latest(asked.data);
    if (found === undefined) return refuse(c, "not_ready", 503);
    const body: RoomHistory = {
      room: asked.data,
      lines: found.map(({ msgid, account, at, text }) => ({
        id: msgid,
        time: new Date(at).toISOString(),
        from: account,
        ...(Address.safeParse(account).success ? { account } : {}),
        text,
      })),
    };
    const text = JSON.stringify(body);
    const tag = `"${createHash("sha256").update(text).digest("hex").slice(0, 16)}"`;
    c.header("cache-control", `public, max-age=${String(KEEP_SECONDS)}`);
    c.header("etag", tag);
    if (c.req.header("if-none-match") === tag) return c.body(null, 304);
    return c.body(text, 200, { "content-type": "application/json" });
  });
  return app;
}
