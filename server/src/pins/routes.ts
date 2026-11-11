// A room's pins over HTTP (slice 4's 4d; docs/plans/slice-4.md §3's threat model): GET /api/pins reads them, by the
// room's own rule of who reads (as /api/rooms and the stream), and POST /api/pins and POST /api/pins/unpin change them.
// Each POST comes from a listed site in JSON (guard.ts) with the login's session; who may pin, a world's moderators and
// the team, is checked before any work, and an account makes 30 requests a minute, each act and refusal logged.
import { PinList, PinRequest, RoomId, type Address } from "@gnoworld/schemas";
import { type Context, Hono } from "hono";
import { baseRefusals, guard, json, refuserOf, sessionOf, type Refusals, type Guarded } from "../guard.ts";
import { limiter } from "../limit.ts";
import type { Log } from "@gnoworld/service/log";
import { asOf, type Right } from "../roles/mayModerate.ts";
import { once } from "../stream/stream.ts";
import { visitorOf } from "../visitor.ts";
import type { Pins } from "./pins.ts";

// An account's pin and unpin requests a minute (docs/decisions.md, 2026-10-27).
const PINS_PER_MINUTE = 30;
// How long a list waits for the right (an owner's is a chain read) before it says the reader may not pin.
const READ_MS = 5_000;

interface Options {
  pins: Pins;
  // What lets an account pin and unpin in a room, if anything: its world's moderators and the team, or its realm's owner (mayModerate). The
  // visitor is the one the limits count, for the chain read behind an owner's right.
  mayPin: (room: string, who: string, visitor: string) => Promise<Right | false>;
  // The same right as a list shows it (`may`): read through a pool of its own, so lists never spend what a pin reads.
  mayShow: (room: string, who: string, visitor: string) => Promise<Right | false>;
  // Whether an account, or a guest (undefined), may read the room: no default, so none is open by mistake.
  readable: (room: string, who: string | undefined) => boolean;
  // The account of a session's token (login.ts's session).
  session: (token: string | undefined) => Address | undefined;
  origins: readonly string[];
  proxy?: string | undefined;
  log: Log;
  now: () => number;
}

// A room's cap and an account's requests are two causes with two codes, which the page words apart; Ergo not
// answering is the server not being ready for it, not a line that is gone.
const refusals = {
  ...baseRefusals,
  forbidden: ["forbidden", 403],
  refused: ["refused", 400],
  full: ["full", 409],
  not_found: ["not_found", 404],
  unavailable: ["not_ready", 503],
} as const satisfies Refusals;

// A read that cannot tell the right, or does not within 5 s, says no: the list still shows.
export const mayWithin = (read: Promise<Right | false>): Promise<boolean> =>
  new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve(false);
    }, READ_MS);
    read
      .then(
        (right) => {
          resolve(right !== false);
        },
        () => {
          resolve(false);
        },
      )
      .finally(() => {
        clearTimeout(timer);
      });
  });

export function pinsRoutes({
  pins,
  mayPin,
  mayShow,
  readable,
  session,
  origins,
  proxy,
  log,
  now,
}: Options): Hono<Guarded> {
  const requests = limiter({ max: PINS_PER_MINUTE, windowMs: 60_000, keys: 100_000 });
  const refuse = refuserOf(log, "pin_refused", refusals);
  const account = (c: Context): Address | undefined => sessionOf(c, session);
  const mayOf = (c: Context, room: string, who: string | undefined): Promise<boolean> =>
    who === undefined ? Promise.resolve(false) : mayWithin(mayShow(room, who, visitorOf(c, proxy)));
  const listOf = async (c: Context, room: string, who: string | undefined): Promise<PinList> => ({
    room,
    may: await mayOf(c, room, who),
    pins: pins.list(room),
  });
  // A POST's account and its room and line: the guard has run; the session, the body, the right and the limit come
  // in that order, and nothing is asked of Ergo before them.
  const request = async (
    c: Context,
  ): Promise<{ who: Address; room: string; msgid: string; right: Right } | Response> => {
    const who = account(c);
    if (who === undefined) return refuse(c, "session");
    const body = PinRequest.safeParse(await json(c));
    if (!body.success) return refuse(c, "body");
    const { room, msgid } = body.data;
    const right = await mayPin(room, who, visitorOf(c, proxy));
    if (right === false) return refuse(c, "forbidden", { room });
    return requests.take(who, now()) ? { who, room, msgid, right } : refuse(c, "limit", { room });
  };

  const app = new Hono<Guarded>();
  app.use(guard(origins, refuse));

  app.get("/", async (c) => {
    const room = RoomId.safeParse(once(c.req.queries("room")));
    if (!room.success) return refuse(c, "body");
    const who = account(c);
    if (!readable(room.data, who)) return refuse(c, "forbidden", { room: room.data });
    return c.json(await listOf(c, room.data, who));
  });

  app.post("/", async (c) => {
    const asked = await request(c);
    if (asked instanceof Response) return asked;
    const { who, room, msgid, right } = asked;
    const added = await pins.add(room, msgid, who);
    if (added !== "pinned" && added !== "already") return refuse(c, added, { room });
    if (added === "pinned") log("pin_added", { room, msgid, account: who, ...asOf(right) });
    return c.json(await listOf(c, room, who));
  });

  app.post("/unpin", async (c) => {
    const asked = await request(c);
    if (asked instanceof Response) return asked;
    const { who, room, msgid, right } = asked;
    if (!pins.remove(room, msgid)) return refuse(c, "not_found", { room });
    log("pin_removed", { room, msgid, account: who, ...asOf(right) });
    return c.json(await listOf(c, room, who));
  });

  return app;
}
