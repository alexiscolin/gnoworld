// A room's pins over HTTP (slice 4's 4d; docs/plans/slice-4.md §3's threat model): GET /api/pins reads them, by the
// room's own rule of who reads (as /api/rooms and the stream), and POST /api/pins and POST /api/pins/unpin change them.
// Each POST comes from a listed site in JSON (guard.ts) with the login's session; who may pin, a world's moderators and
// the team, is checked before any work, and an account makes 30 requests a minute, each act and refusal logged.
import { PinList, PinRequest, RoomId, type Address, type ApiError } from "@gnoworld/schemas";
import { type Context, Hono } from "hono";
import { getCookie } from "hono/cookie";
import { routePath } from "hono/route";
import { guard, json, type Guarded } from "../guard.ts";
import { limiter } from "../limit.ts";
import type { Log } from "../log.ts";
import { once } from "../stream/stream.ts";
import type { Pins } from "./pins.ts";

// An account's pin and unpin requests a minute (docs/decisions.md, 2026-10-27).
const PINS_PER_MINUTE = 30;

interface Options {
  pins: Pins;
  // Whether an account may pin and unpin in a room: its world's moderators and the team.
  mayPin: (room: string, who: string) => boolean;
  // Whether an account, or a guest (undefined), may read the room: no default, so none is open by mistake.
  readable: (room: string, who: string | undefined) => boolean;
  // The account of a session's token (login.ts's session).
  session: (token: string | undefined) => Address | undefined;
  origins: readonly string[];
  log: Log;
  now: () => number;
}

type Status = 400 | 401 | 403 | 404 | 409 | 415 | 429 | 503;

// A room's cap and an account's requests are two causes with two codes, which the page words apart; Ergo not
// answering is the server not being ready for it, not a line that is gone.
const refusals = {
  origin: ["forbidden", 403],
  type: ["unsupported", 415],
  session: ["unauthenticated", 401],
  forbidden: ["forbidden", 403],
  body: ["refused", 400],
  refused: ["refused", 400],
  limit: ["too_many", 429],
  full: ["full", 409],
  not_found: ["not_found", 404],
  unavailable: ["not_ready", 503],
} as const satisfies Record<string, readonly [ApiError["error"], Status]>;

export function pinsRoutes({ pins, mayPin, readable, session, origins, log, now }: Options): Hono<Guarded> {
  const requests = limiter({ max: PINS_PER_MINUTE, windowMs: 60_000, keys: 100_000 });
  const refuse = (c: Context, cause: keyof typeof refusals, room?: string): Response => {
    const [error, status] = refusals[cause];
    log("pin_refused", { route: routePath(c), status, error: cause, ...(room === undefined ? {} : { room }) });
    return c.json({ error } satisfies ApiError, status);
  };
  const account = (c: Context): Address | undefined => session(getCookie(c, "__Host-session"));
  const listOf = (room: string, who: string | undefined): PinList => ({
    room,
    may: who !== undefined && mayPin(room, who),
    pins: pins.list(room),
  });
  // A POST's account and its room and line: the guard has run; the session, the body, the right and the limit come
  // in that order, and nothing is asked of Ergo before them.
  const request = async (c: Context): Promise<{ who: Address; room: string; msgid: string } | Response> => {
    const who = account(c);
    if (who === undefined) return refuse(c, "session");
    const body = PinRequest.safeParse(await json(c));
    if (!body.success) return refuse(c, "body");
    const { room, msgid } = body.data;
    if (!mayPin(room, who)) return refuse(c, "forbidden", room);
    return requests.take(who, now()) ? { who, room, msgid } : refuse(c, "limit", room);
  };

  const app = new Hono<Guarded>();
  app.use(guard(origins, refuse));

  app.get("/", (c) => {
    const room = RoomId.safeParse(once(c.req.queries("room")));
    if (!room.success) return refuse(c, "body");
    const who = account(c);
    if (!readable(room.data, who)) return refuse(c, "forbidden", room.data);
    return c.json(listOf(room.data, who));
  });

  app.post("/", async (c) => {
    const asked = await request(c);
    if (asked instanceof Response) return asked;
    const { who, room, msgid } = asked;
    const added = await pins.add(room, msgid, who);
    if (added !== "pinned" && added !== "already") return refuse(c, added, room);
    if (added === "pinned") log("pin_added", { room, msgid, account: who });
    return c.json(listOf(room, who));
  });

  app.post("/unpin", async (c) => {
    const asked = await request(c);
    if (asked instanceof Response) return asked;
    const { who, room, msgid } = asked;
    if (!pins.remove(room, msgid)) return refuse(c, "not_found", room);
    log("pin_removed", { room, msgid, account: who });
    return c.json(listOf(room, who));
  });

  return app;
}
