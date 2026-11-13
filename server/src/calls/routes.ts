// GET /api/calls/<hash>[/<index>]: one call of a transaction (its arguments, cost, result and events), read by the server from the
// indexer and kept by hash, so a visitor never asks the indexer. A transaction never changes once in a block: a found call is kept
// for good (bounded), a hash the indexer does not hold yet for seconds. Public; per visitor and across all visitors limited.
import { CallDetail, CallHash, CallIndex, indexerHash } from "@gnoworld/schemas";
import type { Log } from "@gnoworld/service/log";
import { send as netSend, type Send } from "@gnoworld/service/net";
import { Hono } from "hono";
import { keptFlights } from "../flights.ts";
import { guard, refuserOf, type Guarded, type Refusals } from "../guard.ts";
import { limiter } from "../limit.ts";
import { visitorOf } from "../visitor.ts";
import { kindOf } from "../worlds/remote.ts";
import { readCall, type Found } from "./read.ts";

const PER_MINUTE = 30;
/** Reads a second across every visitor: each miss is a read of the public indexer, which per-visitor limits do not bound. */
const PER_SECOND = 10;
const KEPT = 500;
export const ABSENT_MS = 5000;

export interface Options {
  indexer: string;
  origins: readonly string[];
  proxy?: string | undefined;
  log: Log;
  now: () => number;
  send?: Send;
  keys?: number;
  perSecond?: number;
}

const refusals = {
  origin: ["forbidden", 403],
  type: ["unsupported", 415],
  refused: ["refused", 400],
  missing: ["not_found", 404],
  limit: ["too_many", 429],
  unavailable: ["not_ready", 503],
} as const satisfies Refusals;

export function callRoutes({
  indexer,
  origins,
  proxy,
  log,
  now,
  send = netSend,
  keys = 100_000,
  perSecond = PER_SECOND,
}: Options): Hono<Guarded> {
  const byVisitor = limiter({ max: PER_MINUTE, windowMs: 60_000, keys });
  const refuse = refuserOf(log, "call_refused", refusals);
  const app = new Hono<Guarded>();
  app.use(guard(origins, refuse));
  // The call kept under its key, else the read already running for it, else a read now; a fault throws. A hash not indexed yet, or a call
  // with no block time (that read failed), is asked again soon.
  const found = keptFlights<Found>({
    now,
    perSecond,
    most: KEPT,
    until: (read) =>
      read.kind === "absent" || (read.kind === "call" && read.detail.time === null)
        ? now() + ABSENT_MS
        : Number.POSITIVE_INFINITY,
  });
  app.get("/:hash/:index?", async (c) => {
    // Counted before anything is read: a refused request is load too.
    if (!byVisitor.take(visitorOf(c, proxy), now())) return refuse(c, "limit");
    const hash = CallHash.safeParse(c.req.param("hash"));
    const index = CallIndex.safeParse(c.req.param("index") ?? "0");
    if (!hash.success || !index.success) return refuse(c, "refused");
    const at = Number(index.data);
    const asked = found(`${hash.data}:${String(at)}`, () => readCall({ send, indexer }, indexerHash(hash.data), at));
    if (asked === "limit") return refuse(c, "limit");
    try {
      const read = await asked;
      if (read.kind !== "call") return refuse(c, "missing");
      c.header("cache-control", "private, max-age=60");
      return c.json(read.detail satisfies CallDetail);
    } catch (error) {
      return refuse(c, "unavailable", { reason: kindOf(error) });
    }
  });
  return app;
}
