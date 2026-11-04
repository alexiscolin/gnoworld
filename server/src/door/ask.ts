// POST /api/jarvis/ask, the door (D42, D43, D44, D93): a question to Jarvis from a room. Each check before any work, in
// this order, each refusal a typed answer and a log line that holds no question: a listed site in JSON (guard.ts), the
// session, the account's rate, the body and the question's cap (a setting, in code points as Zod counts), a room the asker
// may read and its recent lines, the account's quota by its mainnet name; then jarvis, whose answer is passed on only once
// it parses with the client's schema. Logs name the account by its HMAC alone (log.ts).
import { z } from "zod";
import { JarvisQuestion, type Address, type ApiError, type JarvisAnswer, type JarvisAsk } from "@gnoworld/schemas";
import { Hono, type Context } from "hono";
import { getCookie } from "hono/cookie";
import { guard, json, type Guarded } from "../guard.ts";
import { limiter } from "../limit.ts";
import type { Log } from "../log.ts";
import type { Jarvis } from "./jarvis.ts";
import type { Quota } from "./quota.ts";

interface Options {
  // The account of a session's token (login.ts's session).
  session: (token: string | undefined) => Address | undefined;
  origins: readonly string[];
  // Whether an account may read a room (rooms/types.ts's mayRead, through the chat).
  mayRead: (room: string, who: string) => boolean;
  // A room's recent lines, numbered for the asker (lines.ts).
  recent: (room: string, asker: string) => JarvisAsk["lines"];
  // Whether the account has a mainnet name; false whenever that could not be read (names.ts).
  named: (account: Address) => Promise<boolean>;
  quota: Pick<Quota, "take">;
  jarvis: Pick<Jarvis, "ask">;
  // Jarvis switched on (JARVIS=on): off, the route answers off once it knows who asks, and asks nothing of jarvis.
  on: boolean;
  questionChars: number;
  perMinute?: number;
  log: Log;
  now: () => number;
}

type Status = 400 | 401 | 403 | 415 | 429 | 502 | 503 | 504;

const refusals = {
  origin: ["forbidden", 403],
  type: ["unsupported", 415],
  session: ["unauthenticated", 401],
  limit: ["too_many", 429],
  body: ["refused", 400],
  room: ["forbidden", 403],
  quota: ["full", 429],
} as const satisfies Record<string, readonly [ApiError["error"], Status]>;

// What a call to jarvis that failed answers: an answer of the wrong shape or an error is jarvis's fault, nothing
// answering or too slow is a jarvis not ready, and a request gone is answered as nothing ready, to nobody.
const failures = {
  shape: ["internal", 502],
  failed: ["internal", 502],
  down: ["not_ready", 503],
  slow: ["not_ready", 504],
  gone: ["not_ready", 503],
} as const satisfies Record<string, readonly [ApiError["error"], Status]>;

export function askRoutes(options: Options): Hono<Guarded> {
  const { session, origins, mayRead, recent, named, quota, jarvis, on, questionChars, log, now } = options;
  const asked = limiter({ max: options.perMinute ?? 6, windowMs: 60_000, keys: 100_000 });
  const Question = z.string().max(questionChars);
  const route = "/api/jarvis/ask";
  const refuse = (c: Context, cause: keyof typeof refusals, more: { room?: string; account?: string } = {}) => {
    const [error, status] = refusals[cause];
    log("jarvis_refused", { route, status, error: cause, ...more });
    return c.json({ error } satisfies ApiError, status);
  };

  const app = new Hono<Guarded>();
  app.use(guard(origins, refuse));
  app.post("/ask", async (c) => {
    const who = session(getCookie(c, "__Host-session"));
    if (who === undefined) return refuse(c, "session");
    if (!on) {
      log("jarvis_off", { route, status: 200, account: who });
      return c.json({ status: "off" } satisfies JarvisAnswer);
    }
    if (!asked.take(who, now())) return refuse(c, "limit", { account: who });
    const body = JarvisQuestion.safeParse(await json(c));
    if (!body.success || !Question.safeParse(body.data.question).success) return refuse(c, "body", { account: who });
    const { question, room } = body.data;
    if (!mayRead(room, who)) return refuse(c, "room", { room, account: who });
    const lines = recent(room, who);
    if (!quota.take(who, await named(who))) return refuse(c, "quota", { room, account: who });
    const started = now();
    const answer = await jarvis.ask({ question, room, lines }, c.req.raw.signal);
    const ms = now() - started;
    if (!answer.ok) {
      const [error, status] = failures[answer.error];
      log("jarvis_failed", { route, status, error: answer.error, ms, room, account: who });
      return c.json({ error } satisfies ApiError, status);
    }
    log(answer.answer.status === "spent" ? "jarvis_spent" : "jarvis_answered", {
      route,
      status: 200,
      ms,
      room,
      account: who,
    });
    return c.json(answer.answer);
  });
  return app;
}
