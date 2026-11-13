// The links over HTTP (owners' moderation, part 4; docs/plans/owners-moderation.md, section 5): /api/links lists a person's identity, issues a link
// code, finishes a link with the other account's proof and unlinks. Each POST comes from a listed Origin in JSON (guard.ts) with the login's session,
// signed within 10 minutes; limits are its own, never the login's; every refusal is one shape, its cause only in the log.
import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { Address, Nonce, Proof } from "@gnoworld/schemas";
import type { Log } from "@gnoworld/service/log";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { baseRefusals, guard, json, refuserOf, tokenOf, type Guarded, type Refusals } from "../guard.ts";
import { limiter } from "../limit.ts";
import { visitor48Of, visitorOf } from "../visitor.ts";
import { cliVerify } from "./cliProof.ts";
import { FRESH_MS, makeLinks, type Links } from "./links.ts";

export interface LinkRoutesOptions {
  links: Links;
  session: (token: string | undefined) => Address | undefined;
  signedAt: (token: string | undefined) => number | undefined;
  /** A display hint: the worlds whose namespace one of the members holds, read under the visitor's key. */
  worldsOf: (members: readonly Address[], visitor: string) => Promise<string[]>;
  /** The command line's block to copy, composed by the server from its own constants (cliDocument). */
  block: (address: Address, memo: string) => string;
  /** The chain the server checks an Adena proof against: the page compares it with Adena's network before Sign. */
  chainId: string;
  origins: readonly string[];
  proxy: string | undefined;
  log: Log;
  now: () => number;
}

const FILE_MAX = 4096;
const Challenge = z.strictObject({ kind: z.enum(["adena", "cli"]), address: Address });
const Unlink = z.strictObject({ address: Address });
const File = z.string().refine((text) => Buffer.byteLength(text) <= FILE_MAX);
const Verify = z.union([
  z.strictObject({ nonce: Nonce, address: Address, proof: Proof }),
  z.strictObject({ nonce: Nonce, address: Address, file: File }),
]);
// The release asks for an address and finishes with a file alone: no session says who asks.
const ReleaseChallenge = z.strictObject({ address: Address });
const ReleaseVerify = z.strictObject({ nonce: Nonce, address: Address, file: File });

// The word and status of each cause: a code that is no good (unknown, expired, used, another session's) is 404, which depends on the code alone; a proof
// that does not verify is 400, which depends on the signature alone; only once the proof has passed does a key already linked elsewhere say 403.
// The word and status of each cause. A stale session and none are one answer: the page signs in again.
const refusals = {
  ...baseRefusals,
  pending: ["too_many", 429],
  full: ["too_many", 429],
  members: ["full", 409],
  linked: ["forbidden", 403],
  self: ["refused", 400],
  text: ["refused", 400],
  nonce: ["not_found", 404],
  proof: ["refused", 400],
  none: ["not_found", 404],
} as const satisfies Refusals;
type Cause = keyof typeof refusals;

// A person's links, as the server builds them: the command line's verifier is always there (F13858).
export const serverLinks = (db: DatabaseSync, options: { now: () => number; chainId: string; secret: string }): Links =>
  makeLinks(db, { ...options, verifiers: { cli: cliVerify } });

const keyOf = (account: string, visitor: string): string =>
  createHash("sha256").update(`${account} ${visitor}`).digest("base64url");

interface Caller {
  who: Address;
  at: number;
  visitor: string;
}
type Refuse = (c: Context, cause: Cause, extra?: Record<string, unknown>) => Response;
const about = (who: Address, address?: Address) => ({
  account: who,
  ...(address === undefined ? {} : { subject: address }),
});

// A code issued: its nonce, the memo to sign and the command line's block to copy.
const codeAnswer = (c: Context, made: { nonce: string; text: string; expiresAt: string }, block: string) =>
  c.json({ nonce: made.nonce, memo: made.text, block, expiresAt: made.expiresAt });

// The gates every POST passes, in order: the visitor's limit, the session, the account's limit; the route reads its body, then freshness.
function gates(
  { session, signedAt, proxy, now }: Pick<LinkRoutesOptions, "session" | "signedAt" | "proxy" | "now">,
  refuse: Refuse,
) {
  const calls = limiter({ max: 10, windowMs: 60_000, keys: 100_000 });
  const hourly = limiter({ max: 30, windowMs: 60 * 60_000, keys: 100_000 });
  return {
    caller: (c: Context): Caller | Response => {
      const visitor = visitorOf(c, proxy);
      if (!calls.take(visitor, now())) return refuse(c, "limit");
      const token = tokenOf(c);
      const [who, at] = [session(token), signedAt(token)];
      if (who === undefined || at === undefined) return refuse(c, "session");
      if (!hourly.take(who, now())) return refuse(c, "limit", about(who));
      return { who, at, visitor };
    },
    fresh: (c: Context, { who, at }: Caller): Response | undefined =>
      now() - at > FRESH_MS ? refuse(c, "session", about(who)) : undefined,
  };
}

// The release (D13940): no session says who asks, so a code per key and a file signed by it; the guard is the parent's.
function releaseRoutes({ links, block, proxy, log, now }: LinkRoutesOptions, refuse: Refuse): Hono<Guarded> {
  const app = new Hono<Guarded>();
  // The release's limits are its own, one window for each route: a visitor's calls, and the codes issued from its /64.
  const [asks, finishes] = [
    limiter({ max: 10, windowMs: 60_000, keys: 100_000 }),
    limiter({ max: 10, windowMs: 60_000, keys: 100_000 }),
  ];
  const released = limiter({ max: 10, windowMs: 10 * 60_000, keys: 100_000 });
  // One subscriber's /64s are many: a whole /48 gets 20 codes in 10 minutes.
  const released48 = limiter({ max: 20, windowMs: 10 * 60_000, keys: 100_000 });
  const aboutKey = (address: Address) => ({ subject: address });

  app.post("/challenge", async (c) => {
    const visitor = visitorOf(c, proxy);
    if (!asks.take(visitor, now())) return refuse(c, "limit");
    const body = ReleaseChallenge.safeParse(await json(c));
    if (!body.success) return refuse(c, "body");
    const { address } = body.data;
    const wide = visitor48Of(c, proxy);
    if (released.full(visitor, now()) || released48.full(wide, now())) return refuse(c, "pending", aboutKey(address));
    const made = links.startRelease({ subject: address, host: c.get("host") });
    if (made === "text") return refuse(c, "text", aboutKey(address));
    released.take(visitor, now());
    released48.take(wide, now());
    return codeAnswer(c, made, block(address, made.text));
  });

  app.post("/verify", async (c) => {
    if (!finishes.take(visitorOf(c, proxy), now())) return refuse(c, "limit");
    const body = ReleaseVerify.safeParse(await json(c));
    if (!body.success) return refuse(c, "body");
    const { nonce, address, file } = body.data;
    const done = await links.finishRelease({ nonce, address, file, host: c.get("host") });
    if (done === "nonce" || done === "proof") return refuse(c, done, aboutKey(address));
    // Logged for the operator only when a row went; the answer is the same for a linked and a free key.
    if (done === "released") log("link_released", aboutKey(address));
    return c.json({ ok: true });
  });
  return app;
}

export function linkRoutes(options: LinkRoutesOptions): Hono<Guarded> {
  const { links, session, worldsOf, block, chainId, origins, proxy, log, now } = options;
  const refuse = refuserOf(log, "link_refused", refusals);
  const { caller, fresh } = gates(options, refuse);
  const reads = limiter({ max: 30, windowMs: 60_000, keys: 100_000 });
  // ponytail: a fixed window of codes issued, not a count of the pending ones; 10 a /64 in 10 minutes.
  const issued = limiter({ max: 10, windowMs: 10 * 60_000, keys: 100_000 });

  const app = new Hono<Guarded>();
  app.use(guard(origins, refuse));

  app.get("/", async (c) => {
    const visitor = visitorOf(c, proxy);
    if (!reads.take(visitor, now())) return refuse(c, "limit");
    const who = session(tokenOf(c));
    if (who === undefined) return refuse(c, "session");
    const members = links.list(who);
    const addresses = members.length === 0 ? [who] : members.map(({ address }) => address);
    return c.json({ members, worlds: await worldsOf(addresses, keyOf(who, visitor)), linked: members.length > 1 });
  });

  app.post("/challenge", async (c) => {
    const asked = caller(c);
    if (asked instanceof Response) return asked;
    const body = Challenge.safeParse(await json(c));
    if (!body.success) return refuse(c, "body", about(asked.who));
    const stale = fresh(c, asked);
    if (stale !== undefined) return stale;
    const { kind, address } = body.data;
    if (issued.full(asked.visitor, now())) return refuse(c, "pending", about(asked.who, address));
    const made = links.startLink({ by: asked.who, kind, subject: address, host: c.get("host"), signedAt: asked.at });
    if (typeof made === "string") return refuse(c, made === "stale" ? "session" : made, about(asked.who, address));
    issued.take(asked.visitor, now());
    if (kind === "adena") return c.json({ ...made, chainId });
    return codeAnswer(c, made, block(address, made.text));
  });

  app.post("/verify", async (c) => {
    const asked = caller(c);
    if (asked instanceof Response) return asked;
    const body = Verify.safeParse(await json(c));
    if (!body.success) return refuse(c, "body", about(asked.who));
    const stale = fresh(c, asked);
    if (stale !== undefined) return stale;
    const { nonce, address } = body.data;
    const proof =
      "proof" in body.data
        ? ({ kind: "adena", proof: body.data.proof } as const)
        : ({ kind: "cli", file: body.data.file } as const);
    const request = { ...proof, nonce, by: asked.who, address, host: c.get("host"), signedAt: asked.at };
    const done = await links.finishLink(request);
    if (typeof done === "string") return refuse(c, done === "stale" ? "session" : done, about(asked.who, address));
    log("link_made", { ...about(asked.who, address), kind: proof.kind });
    return c.json(done);
  });

  app.post("/unlink", async (c) => {
    const asked = caller(c);
    if (asked instanceof Response) return asked;
    const body = Unlink.safeParse(await json(c));
    if (!body.success) return refuse(c, "body", about(asked.who));
    const stale = fresh(c, asked);
    if (stale !== undefined) return stale;
    const done = links.unlink({ by: asked.who, address: body.data.address, signedAt: asked.at });
    if (typeof done === "string")
      return refuse(c, done === "stale" ? "session" : done, about(asked.who, body.data.address));
    log("link_removed", about(asked.who, body.data.address));
    return c.json(done);
  });

  app.route("/release", releaseRoutes(options, refuse));

  return app;
}
