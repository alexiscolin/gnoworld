// GET /api/explanations/<kind>/<chain>/<subject>: a realm's or a world's explanation: `ready` with its line and tags, `making` while Jarvis writes
// it, or `none`. A subject is a realm's path, URL-encoded. The
// asking starts a making on a miss (make.ts), so each visitor and all visitors together are held to a limit counted before anything is read.
import { ExplainKind, RealmPath, type Explanation } from "@gnoworld/schemas";
import { Hono } from "hono";
import { z } from "zod";
import { limiter } from "../limit.ts";
import { visitorOf } from "../visitor.ts";
import type { Key } from "./store.ts";

const PER_MINUTE = 60;
const PER_SECOND = 20;
const CHAIN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const Subject = z.string().max(200);

export interface ExplainRoutesOptions {
  explainer: { answer: (key: Key) => Explanation };
  proxy?: string | undefined;
  now: () => number;
  keys?: number;
}

export function explainRoutes({ explainer, proxy, now, keys = 100_000 }: ExplainRoutesOptions): Hono {
  const byVisitor = limiter({ max: PER_MINUTE, windowMs: 60_000, keys });
  const together = limiter({ max: PER_SECOND, windowMs: 1000, keys: 1 });
  const routes = new Hono();
  routes.get("/:kind/:chain/:subject", (c) => {
    if (!byVisitor.take(visitorOf(c, proxy), now()) || !together.take("all", now()))
      return c.json({ error: "too_many" }, 429);
    c.header("cache-control", "no-store");
    const kind = ExplainKind.safeParse(c.req.param("kind"));
    const chain = c.req.param("chain");
    const subject = Subject.safeParse(c.req.param("subject"));
    const realm = subject.success ? RealmPath.safeParse(subject.data) : undefined;
    if (!kind.success || !CHAIN.test(chain) || realm?.success !== true) return c.json({ error: "refused" }, 400);
    const answer = explainer.answer({ kind: kind.data, chain, subject: realm.data });
    if (answer.status === "ready") c.header("cache-control", "public, max-age=300");
    return c.json(answer);
  });
  return routes;
}
