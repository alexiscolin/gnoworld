// The login's HTTP face (slice 3's plan, 3c). Every POST comes from a listed Origin and in JSON, the
// CSRF guard: Hono's own csrf() checks form types only. Each visitor's login calls are limited before any
// work, and a failed login gets one answer whatever failed, its cause going to the log alone.
import type { DatabaseSync } from "node:sqlite";
import { getConnInfo } from "@hono/node-server/conninfo";
import { ChallengeRequest, TicketRequest, VerifyRequest, type ApiError, type Me, type Ticket } from "@gnoworld/schemas";
import { Hono, type Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { routePath } from "hono/route";
import type { Config } from "../config.ts";
import { limiter } from "../limit.ts";
import type { Log } from "../log.ts";
import { visitor } from "../visitor.ts";
import { makeLogin, type Login } from "./login.ts";
import { makeTickets, type Tickets } from "./ticket.ts";

interface Options {
  log: Log;
  origins: readonly string[];
  proxy: string | undefined;
  newAccountsPerHour: number;
  now: () => number;
  tickets: Tickets;
}

type Status = 400 | 401 | 403 | 415 | 429;

// The body's JSON, or undefined for text that is not JSON, which the schema then refuses like any bad
// body. Hono's body limit has read the body whole before a route runs (hono/body-limit, 4.13.13).
async function json(c: Context): Promise<unknown> {
  const text = await c.req.text();
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// The host of the POST's Origin, which the guard checked, for the text the challenge writes.
interface Env {
  Variables: { host: string };
}

export function loginRoutes(
  login: Login,
  { log, origins, proxy, newAccountsPerHour, now, tickets }: Options,
): Hono<Env> {
  // __Host-: sent only to the host that set it, over HTTPS, for every path, so no sibling site sets it.
  const session = "__Host-session";
  const cookie = { path: "/", httpOnly: true, secure: true, sameSite: "Strict" } as const;
  const hosts = new Map(origins.map((origin) => [origin, new URL(origin).host]));
  const calls = limiter({ max: 10, windowMs: 60_000, keys: 100_000 });
  const created = limiter({ max: newAccountsPerHour, windowMs: 60 * 60_000, keys: 100_000 });
  // A ticket a reconnect: a household behind one address gets three accounts' worth.
  const mintsByVisitor = limiter({ max: 30, windowMs: 60_000, keys: 100_000 });
  const mintsByAccount = limiter({ max: 10, windowMs: 60_000, keys: 100_000 });

  // The visitor the web proxy names in X-Real-IP, believed only from that proxy (3e sets it).
  const visitorOf = (c: Context): string =>
    visitor(getConnInfo(c).remote.address ?? "", c.req.header("x-real-ip"), proxy);
  const answer = (c: Context, error: ApiError["error"], status: Status): Response =>
    c.json({ error } satisfies ApiError, status);
  // Each cause's answer: every failed login gets the same one, whatever failed.
  const refusals = {
    origin: ["forbidden", 403],
    type: ["unsupported", 415],
    limit: ["too_many", 429],
    full: ["too_many", 429],
    new_account: ["too_many", 429],
    body: ["refused", 400],
    chain: ["refused", 400],
    nonce: ["refused", 400],
    proof: ["refused", 400],
  } as const satisfies Record<string, readonly [ApiError["error"], Status]>;
  const refuse = (c: Context, cause: keyof typeof refusals): Response => {
    const [error, status] = refusals[cause];
    log("login_refused", { route: routePath(c, -1), status, error: cause });
    return answer(c, error, status);
  };

  const app = new Hono<Env>();
  app.use(async (c, next) => {
    c.header("cache-control", "no-store");
    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
      const host = hosts.get(c.req.header("origin") ?? "");
      if (host === undefined) return refuse(c, "origin");
      if (!/^application\/json\s*(;|$)/i.test(c.req.header("content-type") ?? "")) return refuse(c, "type");
      c.set("host", host);
    }
    await next();
    return undefined;
  });

  app.post("/challenge", async (c) => {
    if (!calls.take(visitorOf(c), now())) return refuse(c, "limit");
    const body = ChallengeRequest.safeParse(await json(c));
    if (!body.success) return refuse(c, "body");
    const made = login.challenge(body.data.chainId, c.get("host"));
    return typeof made === "string" ? refuse(c, made) : c.json(made);
  });

  app.post("/verify", async (c) => {
    const who = visitorOf(c);
    if (!calls.take(who, now())) return refuse(c, "limit");
    const body = VerifyRequest.safeParse(await json(c));
    if (!body.success) return refuse(c, "body");
    const result = await login.verify(body.data, () => created.take(who, now()));
    if (typeof result === "string") return refuse(c, result);
    setCookie(c, session, result.token, { ...cookie, maxAge: result.maxAge });
    log("login", { route: routePath(c, -1), account: body.data.address });
    return c.json({ address: body.data.address } satisfies Me);
  });

  app.post("/ticket", async (c) => {
    if (!mintsByVisitor.take(visitorOf(c), now())) return refuse(c, "limit");
    if (!TicketRequest.safeParse(await json(c)).success) return refuse(c, "body");
    const address = login.session(getCookie(c, session));
    if (address === undefined) return answer(c, "unauthenticated", 401);
    if (!mintsByAccount.take(address, now())) return refuse(c, "limit");
    return c.json({ ticket: tickets.mint(address) } satisfies Ticket);
  });

  app.get("/me", (c) => {
    const address = login.session(getCookie(c, session));
    return address === undefined ? answer(c, "unauthenticated", 401) : c.json({ address } satisfies Me);
  });

  app.post("/logout", (c) => {
    login.logout(getCookie(c, session));
    setCookie(c, session, "", { ...cookie, maxAge: 0 });
    return c.body(null, 204);
  });

  return app;
}

type Settings = Pick<Config, "chains" | "origins" | "trustedProxy" | "newAccountsPerHour">;

// The login as the server mounts it, from its settings and one clock.
export function loginFrom(
  db: DatabaseSync,
  { chains, origins, trustedProxy: proxy, newAccountsPerHour }: Settings,
  { log, now = Date.now }: { log: Log; now?: () => number },
): Hono<Env> {
  const tickets = makeTickets(db, { now });
  return loginRoutes(makeLogin(db, { chains, now }), { log, origins, proxy, newAccountsPerHour, now, tickets });
}
