// The first signals over HTTP (slice 9h, D210 to D219): POST /api/signals/chart is a logged-in account opening a world,
// GET /api/signals?world= says who is first there, for anyone. A POST comes from a listed site in JSON (guard.ts); the
// order is the origin, the session, the account's count, then the body and the world, so authorization stands before any
// work and every call of an account is counted, a refused one too (D211, D216): 20 an hour. The winner's signal is told
// once on the stream, never the answer's word alone.
import {
  ChartRequest,
  type Address,
  type ApiError,
  type ChartAnswer,
  type Signal,
  type WorldFirsts,
} from "@gnoworld/schemas";
import { type Context, Hono } from "hono";
import { getCookie } from "hono/cookie";
import { routePath } from "hono/route";
import type { Log } from "@gnoworld/service/log";
import { guard, json, type Guarded } from "../guard.ts";
import type { Roles } from "../roles/roles.ts";
import { limiter } from "../limit.ts";
import { once } from "../stream/stream.ts";
import type { Signals } from "./signals.ts";

// An account's chart calls an hour (docs/decisions.md, D211).
const CALLS_PER_HOUR = 20;

interface Options {
  signals: Signals;
  // The worlds the server lists: a world outside them is none.
  roles: Pick<Roles, "worlds">;
  // The account of a session's token (login.ts's session).
  session: (token: string | undefined) => Address | undefined;
  origins: readonly string[];
  log: Log;
  now: () => number;
  // Tells a signal on the stream.
  publish: (signal: Signal) => void;
}

const refusals = {
  origin: ["forbidden", 403],
  type: ["unsupported", 415],
  session: ["unauthenticated", 401],
  body: ["refused", 400],
  limit: ["too_many", 429],
  not_found: ["not_found", 404],
} as const satisfies Record<string, readonly [ApiError["error"], 400 | 401 | 403 | 404 | 415 | 429]>;

export function signalRoutes({ signals, roles, session, origins, log, now, publish }: Options): Hono<Guarded> {
  const calls = limiter({ max: CALLS_PER_HOUR, windowMs: 60 * 60_000, keys: 100_000 });
  const refuse = (c: Context, cause: keyof typeof refusals): Response => {
    const [error, status] = refusals[cause];
    log("signal_refused", { route: routePath(c), status, error: cause });
    return c.json({ error } satisfies ApiError, status);
  };
  const app = new Hono<Guarded>();
  app.use(guard(origins, refuse));

  app.post("/chart", async (c) => {
    const who = session(getCookie(c, "__Host-session"));
    if (who === undefined) return refuse(c, "session");
    if (!calls.take(who, now())) return refuse(c, "limit");
    const body = ChartRequest.safeParse(await json(c));
    if (!body.success) return refuse(c, "body");
    const { world } = body.data;
    if (!roles.worlds.has(world)) return refuse(c, "not_found");
    const first = signals.chart(world, who);
    const charted = first ? signals.firsts(world).charted : null;
    if (charted !== null) publish({ kind: "chart", world, account: charted.account, at: charted.at });
    return c.json({ world, first } satisfies ChartAnswer);
  });

  app.get("/", (c) => {
    const asked = ChartRequest.safeParse({ world: once(c.req.queries("world")) });
    if (!asked.success) return refuse(c, "body");
    if (!roles.worlds.has(asked.data.world)) return refuse(c, "not_found");
    return c.json(signals.firsts(asked.data.world) satisfies WorldFirsts);
  });

  return app;
}
