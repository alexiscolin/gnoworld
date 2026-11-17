// The login's HTTP face. Every POST comes from a listed Origin and in JSON (guard.ts).
// Each visitor's login calls are limited before any work, and a failed login gets one answer whatever
// failed, its cause going to the log alone.
import type { DatabaseSync } from "node:sqlite";
import {
  Address,
  ChallengeRequest,
  Nonce,
  TicketRequest,
  VerifyRequest,
  type ApiError,
  type Me,
  type Ticket,
} from "@gnoworld/schemas";
import { Hono, type Context } from "hono";
import { setCookie } from "hono/cookie";
import { routePath } from "hono/route";
import type { Config } from "../config.ts";
import { guard, json, SESSION_COOKIE, tokenOf, type Guarded } from "../guard.ts";
import { limiter } from "../limit.ts";
import type { Log } from "@gnoworld/service/log";
import { visitorOf as readVisitor } from "../visitor.ts";
import { z } from "zod";
import { cliBlock, CliFile } from "./cliProof.ts";
import { FRESH_MS } from "./links.ts";
import { makeLogin, type Login } from "./login.ts";
import { makeTickets, type Tickets } from "./ticket.ts";

interface Options {
  log: Log;
  origins: readonly string[];
  proxy: string | undefined;
  newAccountsPerHour: number;
  now: () => number;
  tickets: Tickets;
  /** The command line's block to copy (cliBlock); none given, its login is not mounted, as on the admin console. */
  block?: (address: Address, memo: string) => string;
}

const CliChallenge = z.strictObject({ address: Address });
const CliVerify = z.strictObject({ nonce: Nonce, address: Address, file: CliFile });

type Status = 400 | 401 | 403 | 415 | 429;
// Each cause's answer: every failed login gets the same one, whatever failed.
const refusals = {
  origin: ["forbidden", 403],
  type: ["unsupported", 415],
  limit: ["too_many", 429],
  full: ["too_many", 429],
  new_account: ["too_many", 429],
  body: ["refused", 400],
  chain: ["refused", 400],
  text: ["refused", 400],
  nonce: ["refused", 400],
  proof: ["refused", 400],
} as const satisfies Record<string, readonly [ApiError["error"], Status]>;
type Refuse = (c: Context, cause: keyof typeof refusals) => Response;

// The command line's login (D13880): the login's limits, nonce store, cookie and refusal, a signed file for its proof.
function cliRoutes(
  login: Login,
  block: (address: Address, memo: string) => string,
  gate: {
    take: (c: Context) => boolean;
    mayCreate: (c: Context) => () => boolean;
    refuse: Refuse;
    admitted: (c: Context, result: Awaited<ReturnType<Login["verify"]>>, address: Address) => Response;
  },
): Hono<Guarded> {
  const { take, mayCreate, refuse, admitted } = gate;
  const app = new Hono<Guarded>();
  app.post("/challenge", async (c) => {
    if (!take(c)) return refuse(c, "limit");
    const body = CliChallenge.safeParse(await json(c));
    if (!body.success) return refuse(c, "body");
    const made = login.cliChallenge(body.data.address, c.get("host"));
    if (typeof made === "string") return refuse(c, made);
    const { nonce, text: memo, expiresAt } = made;
    return c.json({ nonce, memo, block: block(body.data.address, memo), expiresAt });
  });

  app.post("/verify", async (c) => {
    if (!take(c)) return refuse(c, "limit");
    const body = CliVerify.safeParse(await json(c));
    if (!body.success) return refuse(c, "body");
    const result = await login.cliVerify(body.data, mayCreate(c), c.get("host"));
    return admitted(c, result, body.data.address);
  });
  return app;
}

export function loginRoutes(
  login: Login,
  { log, origins, proxy, newAccountsPerHour, now, tickets, block }: Options,
): Hono<Guarded> {
  // __Host-: sent only to the host that set it, over HTTPS, for every path, so no sibling site sets it.
  const cookie = { path: "/", httpOnly: true, secure: true, sameSite: "Strict" } as const;
  const calls = limiter({ max: 10, windowMs: 60_000, keys: 100_000 });
  const created = limiter({ max: newAccountsPerHour, windowMs: 60 * 60_000, keys: 100_000 });
  // A ticket a reconnect: a household behind one address gets three accounts' worth.
  const mintsByVisitor = limiter({ max: 30, windowMs: 60_000, keys: 100_000 });
  const mintsByAccount = limiter({ max: 10, windowMs: 60_000, keys: 100_000 });

  // The visitor the web proxy names in X-Real-IP, believed only from that proxy.
  const visitorOf = (c: Context): string => readVisitor(c, proxy);
  const answer = (c: Context, error: ApiError["error"], status: Status): Response =>
    c.json({ error } satisfies ApiError, status);
  const refuse: Refuse = (c, cause) => {
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

  // A proved login's cookie, and the account it names; every refusal the same answer.
  const admitted = (c: Context, result: Awaited<ReturnType<Login["verify"]>>, address: Address): Response => {
    if (typeof result === "string") return refuse(c, result);
    setCookie(c, SESSION_COOKIE, result.token, { ...cookie, maxAge: result.maxAge });
    log("login", { route: routePath(c, -1), account: address });
    return c.json({ address } satisfies Me);
  };

  app.post("/verify", async (c) => {
    const who = visitorOf(c);
    if (!calls.take(who, now())) return refuse(c, "limit");
    const body = VerifyRequest.safeParse(await json(c));
    if (!body.success) return refuse(c, "body");
    const result = await login.verify(body.data, () => created.take(who, now()), c.get("host"));
    return admitted(c, result, body.data.address);
  });

  if (block !== undefined) {
    const take = (c: Context) => calls.take(visitorOf(c), now());
    const mayCreate = (c: Context) => {
      const who = visitorOf(c);
      return () => created.take(who, now());
    };
    app.route("/cli", cliRoutes(login, block, { take, mayCreate, refuse, admitted }));
  }

  app.post("/ticket", async (c) => {
    if (!mintsByVisitor.take(visitorOf(c), now())) return refuse(c, "limit");
    if (!TicketRequest.safeParse(await json(c)).success) return refuse(c, "body");
    const address = login.session(tokenOf(c));
    if (address === undefined) return answer(c, "unauthenticated", 401);
    if (!mintsByAccount.take(address, now())) return refuse(c, "limit");
    return c.json({ ticket: tickets.mint(address) } satisfies Ticket);
  });

  // Nobody is an answer, a 200: a visitor's page asks it on every load, and a 401 would be logged as an error.
  app.get("/me", (c) => c.json({ address: login.session(tokenOf(c)) ?? null } satisfies Me));

  app.post("/logout", (c) => {
    login.logout(tokenOf(c));
    setCookie(c, SESSION_COOKIE, "", { ...cookie, maxAge: 0 });
    return c.body(null, 204);
  });

  // Every other session of the caller's address ends, this cookie staying good: ADR-0002 §4's "revocable in the settings".
  // A login of the last ten minutes only, like a link: a relayed session must not keep the power to end the person's own logins.
  app.post("/logout-others", (c) => {
    if (!calls.take(visitorOf(c), now())) return refuse(c, "limit");
    const token = tokenOf(c);
    const signed = login.signedAt(token);
    if (login.session(token) === undefined || signed === undefined || now() - signed > FRESH_MS)
      return answer(c, "unauthenticated", 401);
    login.logoutOthers(token);
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
  const cli = console ? {} : { block: cliBlock };
  return loginRoutes(login, { log, origins, proxy, newAccountsPerHour, now, tickets, ...cli });
}
