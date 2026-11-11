// GET /api/search?q=&world=&room=&from=&link=1&since=&until=&before= (slice 13, B2; D13917, D13924; docs/plans/search.md §3 B, §4):
// the lines of one world's rooms that hold the words, for the reader only. The right is asked here, on every page, whatever the
// room was when its lines came in: searchable (never a members or hidden room), not archived, and `mayRead` (F13700-sec: never
// `mayRead` alone). A hidden, archived or unknown room is the empty page; a room the reader may not read is a 403, as the stream's.
import { type Address, SEARCH_PAGE, SearchQuery, type SearchPage } from "@gnoworld/schemas";
import type { Log } from "@gnoworld/service/log";
import { type Context, Hono } from "hono";
import { getCookie } from "hono/cookie";
import { guard, refuserOf, type Refusals, type Guarded } from "../guard.ts";
import { limiter } from "../limit.ts";
import { worldOf } from "../rooms/rooms.ts";
import { hiddenRoom, mayRead, searchable, type Typed } from "../rooms/types.ts";
import { visitorOf } from "../visitor.ts";
import type { Search } from "./index.ts";
import type { Found, Query } from "./query.ts";
import { snippetOf } from "./snippet.ts";

/** Requests a minute: a visitor, and an account (its address is the key when the session is valid). */
const SEARCH_PER_MINUTE = 20;
const SEARCH_ACCOUNT_PER_MINUTE = 60;
/** Searches a second across every visitor: the index is one synchronous connection, so per-visitor limits do not bound its load (F13770). */
const SEARCH_PER_SECOND = 10;

export interface Options {
  search: Pick<Search, "query">;
  roles: Typed;
  /** An archived room is unlisted whatever its type: its lines are not found. */
  archived: (room: string) => boolean;
  /** The rooms the server knows of a world (listRooms). */
  rooms: (world: string) => readonly string[];
  session: (token: string | undefined) => Address | undefined;
  origins: readonly string[];
  proxy?: string | undefined;
  log: Log;
  now: () => number;
  /** The limiter's key cap (default 100,000). */
  keys?: number;
  /** Searches a second across all visitors (default SEARCH_PER_SECOND). */
  perSecond?: number;
}

const refusals = {
  origin: ["forbidden", 403],
  type: ["unsupported", 415],
  refused: ["refused", 400],
  forbidden: ["forbidden", 403],
  limit: ["too_many", 429],
  unavailable: ["not_ready", 503],
} as const satisfies Refusals;

// The cursor: a row number the schema checked.
const cursorOf = (before: string | undefined): Query["before"] =>
  before === undefined ? undefined : { rowid: Number(before) };

// A page: 20 hits, the cursor of the next (the last shown's row) when there are more, and the totals.
const pageOf = ({ rows, total, capped, partial }: Found, q: string): SearchPage => {
  const shown = rows.slice(0, SEARCH_PAGE);
  const last = shown.at(-1);
  return {
    hits: shown.map(({ room, msgid, account, at, link, text }) => ({
      room,
      msgid,
      account,
      at,
      link,
      ...snippetOf(text, q),
    })),
    next: rows.length > SEARCH_PAGE && last !== undefined ? String(last.rowid) : null,
    total,
    capped,
    partial,
  };
};

const EMPTY: SearchPage = { hits: [], next: null, total: 0, capped: false, partial: false };

// The parameters as the schema reads them: one value each, a repeated one stays a list and fails.
const paramsOf = (c: Context): Record<string, string | string[]> =>
  Object.fromEntries(
    Object.entries(c.req.queries()).map(([name, values]) => [name, values.length === 1 ? (values[0] ?? "") : values]),
  );

export function searchRoutes({
  search,
  roles,
  archived,
  rooms,
  session,
  origins,
  proxy,
  log,
  now,
  keys = 100_000,
  perSecond = SEARCH_PER_SECOND,
}: Options): Hono<Guarded> {
  const byVisitor = limiter({ max: SEARCH_PER_MINUTE, windowMs: 60_000, keys });
  const byAccount = limiter({ max: SEARCH_ACCOUNT_PER_MINUTE, windowMs: 60_000, keys });
  const together = limiter({ max: perSecond, windowMs: 1000, keys: 1 });
  const refuse = refuserOf(log, "search_refused", refusals);
  // The rooms the reader's search covers: the asked room alone, or the world's. `undefined`: the reader may not read the room.
  const covered = (
    world: string,
    room: string | undefined,
    who: Address | undefined,
  ): readonly string[] | undefined => {
    const open = (name: string): boolean => searchable(roles, name) && !archived(name) && mayRead(roles, name, who);
    if (room === undefined) return rooms(world).filter(open);
    if (!rooms(world).includes(room) || hiddenRoom(roles, room) || archived(room)) return [];
    if (!mayRead(roles, room, who)) return undefined;
    return open(room) ? [room] : [];
  };

  // The asked rooms and the narrowing of a valid request, or why it is refused.
  const asked = (c: Context, who: Address | undefined): Query | "refused" | "forbidden" => {
    const parsed = SearchQuery.safeParse(paramsOf(c));
    if (!parsed.success) return "refused";
    const { q, world, room, from, link, since, until, before } = parsed.data;
    const [begun, ended] = [since, until].map((time) => (time === undefined ? undefined : Date.parse(time)));
    if ((room !== undefined && worldOf(room) !== world) || Number.isNaN(begun) || Number.isNaN(ended)) return "refused";
    const rooms_ = covered(world, room, who);
    if (rooms_ === undefined) return "forbidden";
    const query: Query = {
      rooms: rooms_,
      q,
      limit: SEARCH_PAGE + 1,
      from,
      link: link === undefined ? undefined : true,
      since: begun,
      until: ended,
    };
    return { ...query, before: cursorOf(before) };
  };
  const app = new Hono<Guarded>();
  app.use(guard(origins, refuse));
  app.get("/", (c) => {
    const who = session(getCookie(c, "__Host-session"));
    // Counted before anything is read: a refused request is load too.
    if (!(who === undefined ? byVisitor.take(visitorOf(c, proxy), now()) : byAccount.take(who, now())))
      return refuse(c, "limit");
    // After the visitor's own: a request refused there spends nothing of the whole's.
    if (!together.take("all", now())) return refuse(c, "limit");
    const query = asked(c, who);
    if (typeof query === "string") return refuse(c, query);
    if (query.rooms.length === 0) return c.json(EMPTY);
    try {
      return c.json(pageOf(search.query(query), query.q));
    } catch (error) {
      // The name alone: a message may quote the words searched.
      return refuse(c, "unavailable", { reason: error instanceof Error ? error.name : "unknown" });
    }
  });
  return app;
}
