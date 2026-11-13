// GET /api/people/<address>: what the chat's person card shows beyond the face. Built per request from the rollup's state (an indexed read of a
// few ms, never an indexer query: an address no one ever called with would cost the indexer a full scan), the worlds file the job holds in
// memory, and one cached balance (balance.ts). One synchronous connection serves it, so besides each visitor's own limit one limit counts
// every visitor together. A person with no record has an empty answer, not an error.
import { labelName } from "@gnoworld/core";
import { Address, type ApiError } from "@gnoworld/schemas";
import { PERSON_CAPS, PERSON_MAX_BYTES, PersonCardData, Worlds } from "@gnoworld/schemas/indexer";
import type { Log } from "@gnoworld/service/log";
import { type Context, Hono } from "hono";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { limiter } from "../limit.ts";
import { visitorOf } from "../visitor.ts";
import type { Balance, BalanceReader } from "./balance.ts";
import { heldBy } from "./tokenAnswer.ts";

const PER_MINUTE = 30;
/** Cards a second across every visitor. */
const PER_SECOND = 10;

const Total = z.object({ calls: z.number(), realms: z.number() });
const Days = z.array(z.object({ day: z.string(), calls: z.number() }));
const Latest = z.array(
  z.object({
    realm: z.string(),
    func: z.nullable(z.string()),
    success: z.number(),
    time: z.nullable(z.string()),
  }),
);

/** The worlds `address` deployed a realm of: the first `PERSON_CAPS.system` and how many more. */
export function systemOf(worlds: Worlds | undefined, address: string): PersonCardData["system"] {
  const mine = (worlds?.worlds ?? []).flatMap((world) => {
    const title = labelName(world.id);
    const realm = world.realms.find(({ deployer }) => deployer === address);
    return title === null || realm === undefined ? [] : [{ world: world.id, title, realm: realm.path }];
  });
  return { worlds: mine.slice(0, PERSON_CAPS.system), more: Math.max(0, mine.length - PERSON_CAPS.system) };
}

/** A person's calls and latest calls from the rollup's state, every list at its cap; the calls are none for a person with no call. */
export function callsOf(db: DatabaseSync, address: string): Pick<PersonCardData, "calls" | "latest"> {
  const total = Total.parse(
    db
      .prepare("SELECT coalesce(sum(calls), 0) AS calls, count(*) AS realms FROM rollup_callers WHERE caller = ?")
      .get(address),
  );
  if (total.calls === 0) return { calls: null, latest: [] };
  const days = Days.parse(
    db
      .prepare(
        `SELECT day, calls FROM rollup_caller_days WHERE caller = ? ORDER BY day DESC LIMIT ${String(PERSON_CAPS.days)}`,
      )
      .all(address),
  ).reverse();
  const latest = Latest.parse(
    db
      .prepare(
        `SELECT realm, func, success, time FROM rollup_calls WHERE caller = ? ORDER BY id DESC LIMIT ${String(PERSON_CAPS.latest)}`,
      )
      .all(address),
  ).map((row) => ({ ...row, success: row.success === 1 }));
  return { calls: { total: total.calls, realms: total.realms, days }, latest };
}

export interface Options {
  db: DatabaseSync;
  /** The worlds file of the last pass, none before one. */
  worlds: () => Worlds | undefined;
  balance: BalanceReader;
  proxy?: string | undefined;
  log: Log;
  now: () => number;
  perSecond?: number;
}

const fail = (c: Context, error: ApiError["error"], status: 400 | 429 | 500): Response =>
  c.json({ error } satisfies ApiError, status);

export function peopleRoutes({ db, worlds, balance, proxy, log, now, perSecond = PER_SECOND }: Options): Hono {
  const byVisitor = limiter({ max: PER_MINUTE, windowMs: 60_000, keys: 100_000 });
  const together = limiter({ max: perSecond, windowMs: 1000, keys: 1 });
  const routes = new Hono();
  routes.get("/:address", async (c) => {
    // Counted before anything is read: a refused request is load too. The query string is never read.
    if (!byVisitor.take(visitorOf(c, proxy), now()) || !together.take("all", now())) {
      return fail(c, "too_many", 429);
    }
    const address = Address.safeParse(c.req.param("address"));
    if (!address.success) {
      return fail(c, "refused", 400);
    }
    try {
      const mine: Balance = await balance(address.data);
      const answer = PersonCardData.parse({
        balance: mine,
        system: systemOf(worlds(), address.data),
        ...callsOf(db, address.data),
        tokens: heldBy(db, address.data, PERSON_CAPS.tokens).map(({ realm, symbol, decimals, amount }) => ({
          realm,
          symbol,
          decimals,
          amount,
        })),
      });
      const text = JSON.stringify(answer);
      if (text.length > PERSON_MAX_BYTES) throw new RangeError("too large");
      c.header("cache-control", "private, max-age=30");
      return c.body(text, 200, { "content-type": "application/json" });
    } catch (error) {
      // The name alone: a row may hold a stranger's text.
      log("person_failed", { error: error instanceof Error ? error.name : "unknown" });
      return fail(c, "internal", 500);
    }
  });
  return routes;
}
