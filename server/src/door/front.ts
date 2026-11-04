// What the door's routes share (10g, 10k): the guard on a route's own path (a listed site in JSON, guard.ts), its refusals
// typed and logged by route, then the first steps of a POST in order, the session, the switch and the account's rate a
// minute; and jarvis's answer passed on, or its failure answered, each logged with what took how long. Logs name the
// account by its HMAC alone (log.ts) and never what was asked.
import type { Address, ApiError } from "@gnoworld/schemas";
import { Hono, type Context } from "hono";
import { getCookie } from "hono/cookie";
import type { Log } from "@gnoworld/service/log";
import { guard, type Guarded } from "../guard.ts";
import { limiter } from "../limit.ts";
import type { Failure } from "./jarvis.ts";

/** What every door route is given. */
export interface Front {
  // The account of a session's token (login.ts's session).
  session: (token: string | undefined) => Address | undefined;
  origins: readonly string[];
  // Jarvis switched on (JARVIS=on): off, a route answers off once it knows who asks, and asks nothing of jarvis.
  on: boolean;
  log: Log;
  now: () => number;
}

type Status = 400 | 401 | 403 | 404 | 415 | 429 | 502 | 503 | 504;

const refusals = {
  origin: ["forbidden", 403],
  type: ["unsupported", 415],
  session: ["unauthenticated", 401],
  limit: ["too_many", 429],
  body: ["refused", 400],
  room: ["forbidden", 403],
  line: ["not_found", 404],
  quota: ["full", 429],
} as const satisfies Record<string, readonly [ApiError["error"], Status]>;

// What a call to jarvis that failed answers: an answer of the wrong shape or an error is jarvis's fault, nothing
// answering or too slow is a jarvis not ready, a request gone is answered as nothing ready, to nobody, and a request
// jarvis refused is refused.
const failures = {
  shape: ["internal", 502],
  failed: ["internal", 502],
  down: ["not_ready", 503],
  slow: ["not_ready", 504],
  gone: ["not_ready", 503],
  refused: ["refused", 400],
} as const satisfies Record<Failure, readonly [ApiError["error"], Status]>;

type Called<A> = { ok: true; answer: A } | { ok: false; error: Failure };
interface Asked {
  readonly started: number;
  readonly room?: string;
  readonly account: string;
}

/** A door route's app at `path` under /api/jarvis, with its rate a minute: its refusal, its first steps and its relay. */
export function frontOf(front: Front, { path, perMinute }: { path: string; perMinute: number }) {
  const { session, origins, on, log, now } = front;
  const route = `/api/jarvis${path}`;
  const rate = limiter({ max: perMinute, windowMs: 60_000, keys: 100_000 });
  const refuse = (c: Context, cause: keyof typeof refusals, more: { room?: string; account?: string } = {}) => {
    const [error, status] = refusals[cause];
    log("jarvis_refused", { route, status, error: cause, ...more });
    return c.json({ error } satisfies ApiError, status);
  };
  const app = new Hono<Guarded>();
  app.use(path, guard(origins, refuse));
  // Who asks, once the session, the switch and the rate let it through; else the answer that ends the request.
  const admit = (c: Context): Address | Response => {
    const who = session(getCookie(c, "__Host-session"));
    if (who === undefined) return refuse(c, "session");
    if (!on) {
      log("jarvis_off", { route, status: 200, account: who });
      return c.json({ status: "off" });
    }
    if (!rate.take(who, now())) return refuse(c, "limit", { account: who });
    return who;
  };
  // jarvis's answer, passed on once the client's schema parsed it, or its failure as the door answers it.
  const relay = <A extends { status: string }>(c: Context, called: Called<A>, { started, ...asked }: Asked) => {
    const ms = now() - started;
    if (!called.ok) {
      const [error, status] = failures[called.error];
      log("jarvis_failed", { route, status, error: called.error, ms, ...asked });
      return c.json({ error } satisfies ApiError, status);
    }
    log(`jarvis_${called.answer.status}`, { route, status: 200, ms, ...asked });
    return c.json(called.answer);
  };
  return { app, refuse, admit, relay };
}
