// The login's HTTP face (slice 3's plan, 3c). Every POST comes from a listed Origin and in JSON (guard.ts).
// Each visitor's login calls are limited before any work, and a failed login gets one answer whatever
// failed, its cause going to the log alone.
import type { DatabaseSync } from "node:sqlite";
import { ChallengeRequest, TicketRequest, VerifyRequest, type ApiError, type Me, type Ticket } from "@gnoworld/schemas";
import { Hono, type Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { routePath } from "hono/route";
import type { Config } from "../config.ts";
import { guard, json, type Guarded } from "../guard.ts";
import { limiter } from "../limit.ts";
import type { Log } from "@gnoworld/service/log";
import { visitorOf as readVisitor } from "../visitor.ts";
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

export function loginRoutes(
  login: Login,
  { log, origins, proxy, newAccountsPerHour, now, tickets }: Options,
): Hono<Guarded> {
  // __Host-: sent only to the host that set it, over HTTPS, for every path, so no sibling site sets it.
  const session = "__Host-session";
  const cookie = { path: "/", httpOnly: true, secure: true, sameSite: "Strict" } as const;
  const calls = limiter({ max: 10, windowMs: 60_000, keys: 100_000 });
  const created = limiter({ max: newAccountsPerHour, windowMs: 60 * 60_000, keys: 100_000 });
  // A ticket a reconnect: a household behind one address gets three accounts' worth.
  const mintsByVisitor = limiter({ max: 30, windowMs: 60_000, keys: 100_000 });
  const mintsByAccount = limiter({ max: 10, windowMs: 60_000, keys: 100_000 });

  // The visitor the web proxy names in X-Real-IP, believed only from that proxy (3e sets it).
  const visitorOf = (c: Context): string => readVisitor(c, proxy);
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

  const app = new Hono<Guarded>();
  // The host of the POST's Origin, for the text the challenge writes.
  app.use(guard(origins, refuse));

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
    const result = await login.verify(body.data, () => created.take(who, now()), c.get("host"));
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

  // Nobody is an answer, a 200: a visitor's page asks it on every load, and a 401 would be logged as an error.
  app.get("/me", (c) => c.json({ address: login.session(getCookie(c, session)) ?? null } satisfies Me));

  app.post("/logout", (c) => {
    login.logout(getCookie(c, session));
    setCookie(c, session, "", { ...cookie, maxAge: 0 });
    return c.body(null, 204);
  });

  return app;
}

type Settings = Pick<Config, "chains" | "origins" | "trustedProxy" | "newAccountsPerHour">;

// The login as the server mounts it, from its settings and one clock; the admin console's on its own listener.
export function loginFrom(
  db: DatabaseSync,
  { chains, origins, trustedProxy: proxy, newAccountsPerHour }: Settings,
  { log, now = Date.now, console = false }: { log: Log; now?: () => number; console?: boolean },
): Hono<Guarded> {
  const tickets = makeTickets(db, { now });
  const login = makeLogin(db, { chains, now, console });
  return loginRoutes(login, { log, origins, proxy, newAccountsPerHour, now, tickets });
}
