// The first signals over HTTP (slice 9h, D210 to D218): POST /api/signals/chart is a logged-in account opening a world; who
// is first is told on the stream alone (D215). A POST comes from a listed site in JSON (guard.ts); the
// order is the origin, the session, the account's count, then the body and the world, so authorization stands before any
// work and every call of an account is counted, a refused one too (D211, D216): 20 an hour. The winner's signal is told
// once on the stream, never the answer's word alone.
import { ChartRequest, type Address, type ChartAnswer, type Signal } from "@gnoworld/schemas";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { Log } from "@gnoworld/service/log";
import { guard, json, refuserOf, type Refusals, type Guarded } from "../guard.ts";
import type { Roles } from "../roles/roles.ts";
import { limiter } from "../limit.ts";
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
  // The worlds that can be charted (FIRST_TO_CHART_WORLDS, D218); every listed world when none.
  chartable?: ReadonlySet<string> | undefined;
}

const refusals = {
  origin: ["forbidden", 403],
  type: ["unsupported", 415],
  session: ["unauthenticated", 401],
  body: ["refused", 400],
  limit: ["too_many", 429],
  not_found: ["not_found", 404],
} as const satisfies Refusals;

export function signalRoutes({
  signals,
  roles,
  session,
  origins,
  log,
  now,
  publish,
  chartable,
}: Options): Hono<Guarded> {
  const calls = limiter({ max: CALLS_PER_HOUR, windowMs: 60 * 60_000, keys: 100_000 });
  const refuse = refuserOf(log, "signal_refused", refusals);
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
    const first = (chartable === undefined || chartable.has(world)) && signals.chart(world, who);
    const charted = first ? signals.firsts(world).charted : null;
    if (charted !== null) publish({ kind: "chart", world, account: charted.account, at: charted.at });
    return c.json({ world, first } satisfies ChartAnswer);
  });

  return app;
}
