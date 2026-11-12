// GET /api/tokens/<hash of a realm's path>: the realm's tokens, replayed by the worlds job and read from the database, never from a node.
// The hash is the rollup file's name (core's rollupName), so no path travels; a hash with no token is a 404, which the plate reads as no
// block. Held to a limit for each visitor and for all of them together, counted before anything is read.
import { TokenAnswer } from "@gnoworld/schemas/indexer";
import { Hono } from "hono";
import { limiter } from "../limit.ts";
import { visitorOf } from "../visitor.ts";

const PER_MINUTE = 60;
const PER_SECOND = 20;

export interface TokenRoutesOptions {
  /** A realm's tokens by its path's hash, none for a realm without. */
  answer: (hash: string) => TokenAnswer | undefined;
  proxy?: string | undefined;
  now: () => number;
  keys?: number;
}

export function tokenRoutes({ answer, proxy, now, keys = 100_000 }: TokenRoutesOptions): Hono {
  const byVisitor = limiter({ max: PER_MINUTE, windowMs: 60_000, keys });
  const together = limiter({ max: PER_SECOND, windowMs: 1000, keys: 1 });
  const routes = new Hono();
  routes.get("/:hash", (c) => {
    if (!byVisitor.take(visitorOf(c, proxy), now()) || !together.take("all", now()))
      return c.json({ error: "too_many" }, 429);
    const hash = c.req.param("hash");
    const found = /^[0-9a-f]{32}$/.test(hash) ? answer(hash) : undefined;
    if (found === undefined) return c.json({ error: "not_found" }, 404);
    c.header("cache-control", "public, max-age=60");
    return c.json(found);
  });
  return routes;
}
