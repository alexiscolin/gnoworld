// The admin API's Jarvis part (ADR-0002 §6; D47, D96): on its own listener, never the public API's. Every call comes from
// a listed admin site in JSON (guard.ts), with a session whose account is in the roles file's team, checked first; an
// account makes 30 calls a minute. GET / reads the values; a change is made in two steps, POST /challenge then POST
// /change, its text the action in words, signed afresh through the login's own nonce and verifier (login.ts's
// makeSigned), then made at once, the quotas and the allowlist in the server's database, a budget by jarvis (D45). Each
// change and refusal is logged: who, what and when, every account by its HMAC.
import {
  JarvisChange,
  JarvisChangeRequest,
  VerifyRequest,
  type Address,
  type ApiError,
  type JarvisSettings,
} from "@gnoworld/schemas";
import { Hono, type Context } from "hono";
import { getCookie } from "hono/cookie";
import { z } from "zod";
import { guard, json, type Guarded } from "../guard.ts";
import { limiter } from "../limit.ts";
import type { Log } from "../log.ts";
import type { Signed } from "../login/login.ts";
import type { Jarvis } from "./jarvis.ts";
import type { Quota } from "./quota.ts";

interface Options {
  isTeam: (who: Address) => boolean;
  session: (token: string | undefined) => Address | undefined;
  origins: readonly string[];
  signed: Signed;
  quota: Pick<Quota, "values" | "change">;
  // None when the server has no jarvis to send a budget to: the budgets read as none, and their change is not ready.
  jarvis?: Pick<Jarvis, "budgets" | "setBudget">;
  log: Log;
  now: () => number;
}

type Status = 400 | 401 | 403 | 409 | 415 | 429 | 503;

const refusals = {
  origin: ["forbidden", 403],
  type: ["unsupported", 415],
  session: ["unauthenticated", 401],
  team: ["forbidden", 403],
  limit: ["too_many", 429],
  body: ["refused", 400],
  chain: ["refused", 400],
  full: ["too_many", 429],
  signer: ["refused", 400],
  nonce: ["refused", 400],
  proof: ["refused", 400],
  by: ["refused", 400],
  unlimited: ["full", 409],
  unapplied: ["not_ready", 503],
} as const satisfies Record<string, readonly [ApiError["error"], Status]>;

// The action in words, the line a wallet shows above the login's own (ADR-0002 §6, "Hardened").
function wordsOf(change: JarvisChange): string {
  const questions = (count: number): string => `${String(count)} question${count === 1 ? "" : "s"}`;
  switch (change.setting) {
    case "quota":
      return `Jarvis: the daily quota is ${questions(change.questions)}`;
    case "quota_unnamed":
      return `Jarvis: the daily quota of an account with no mainnet name is ${questions(change.questions)}`;
    case "unlimited":
      return `Jarvis: ${change.account} ${change.unlimited ? "has no quota" : "has the daily quota"}`;
    case "budget":
      return `Jarvis: the daily budget for ${change.budget === "ask" ? "questions" : "translations"} is $${String(change.dollars)}`;
  }
}

// What the log says of a change: the setting, its value, and the account it names, which the log hashes.
function logged(change: JarvisChange): { setting: string; value: number; subject?: string } {
  if (change.setting === "budget") return { setting: `budget_${change.budget}`, value: change.dollars };
  if (change.setting === "unlimited")
    return { setting: "unlimited", value: change.unlimited ? 1 : 0, subject: change.account };
  return { setting: change.setting, value: change.questions };
}

export function adminRoutes(options: Options): Hono<Guarded> {
  const { isTeam, session, origins, signed, quota, jarvis, log, now } = options;
  const calls = limiter({ max: 30, windowMs: 60_000, keys: 10_000 });
  const Stored = z.object({ by: z.string(), change: z.unknown() });
  const refuse = (c: Context, cause: keyof typeof refusals, account?: string): Response => {
    const [error, status] = refusals[cause];
    log("admin_refused", { route: c.req.path, status, error: cause, ...(account === undefined ? {} : { account }) });
    return c.json({ error } satisfies ApiError, status);
  };
  // The team member who calls, checked before any work: a session, the team, the rate.
  const caller = (c: Context): Address | Response => {
    const who = session(getCookie(c, "__Host-session"));
    if (who === undefined) return refuse(c, "session");
    if (!isTeam(who)) return refuse(c, "team", who);
    return calls.take(who, now()) ? who : refuse(c, "limit", who);
  };
  const values = async (): Promise<JarvisSettings> => {
    const budgets = jarvis === undefined ? undefined : await jarvis.budgets();
    return { ...quota.values(), budgets: budgets?.ok === true ? budgets.budgets : null };
  };
  // The change made at once: the quotas here, a budget by jarvis; what came of it.
  const apply = async (change: JarvisChange): Promise<"changed" | "unlimited" | "unapplied"> => {
    if (change.setting !== "budget") return quota.change(change) === "full" ? "unlimited" : "changed";
    const set = await jarvis?.setBudget({ budget: change.budget, dollars: change.dollars });
    return set?.ok === true ? "changed" : "unapplied";
  };

  const app = new Hono<Guarded>();
  app.use(guard(origins, refuse));

  app.get("/", async (c) => {
    const who = caller(c);
    return who instanceof Response ? who : c.json(await values());
  });

  app.post("/challenge", async (c) => {
    const who = caller(c);
    if (who instanceof Response) return who;
    const body = JarvisChangeRequest.safeParse(await json(c));
    if (!body.success) return refuse(c, "body", who);
    const { chainId, change } = body.data;
    const head = ["Change gnoworld's settings (admin, version 1)", "", wordsOf(change), "", `Account: ${who}`];
    const made = signed.issue(chainId, c.get("host"), { head, action: JSON.stringify({ by: who, change }) });
    return typeof made === "string" ? refuse(c, made, who) : c.json(made);
  });

  app.post("/change", async (c) => {
    const who = caller(c);
    if (who instanceof Response) return who;
    const body = VerifyRequest.safeParse(await json(c));
    if (!body.success) return refuse(c, "body", who);
    if (body.data.address !== who) return refuse(c, "signer", who);
    const proved = await signed.proveAction(body.data, c.get("host"));
    if (typeof proved === "string") return refuse(c, proved, who);
    const { by, change } = Stored.parse(JSON.parse(proved.action));
    // Asked by this account: another team member's challenge is not this one's to sign.
    if (by !== who) return refuse(c, "by", who);
    const parsed = JarvisChange.parse(change);
    const result = await apply(parsed);
    if (result !== "changed") return refuse(c, result, who);
    log("admin_change", { route: c.req.path, status: 200, account: who, ...logged(parsed) });
    return c.json(await values());
  });

  return app;
}
