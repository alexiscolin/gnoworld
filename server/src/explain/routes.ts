// GET /api/explanations/<kind>/<chain>/<subject>: a realm's or a world's explanation: `ready` with its line and tags, `making` while Jarvis writes
// it, or `none`. A subject is a realm's path, URL-encoded. The
// asking starts a making on a miss (make.ts), so each visitor and all visitors together are held to a limit counted before anything is read.
import { ChainId, ExplainKind, RealmPath, type Explanation } from "@gnoworld/schemas";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { limiter } from "../limit.ts";
import { visitor48Of, visitorOf } from "../visitor.ts";
import type { Key } from "./store.ts";

const PER_MINUTE = 60;
const PER_SECOND = 20;
const Subject = z.string().max(200);

export interface ExplainRoutesOptions {
  explainer: { answer: (key: Key, visitor: string) => Explanation; ready: (key: Key) => Explanation | undefined };
  proxy?: string | undefined;
  now: () => number;
  keys?: number;
}

// The subject a request names, or none for one the schemas refuse.
function keyOf(c: Context): Key | undefined {
  const kind = ExplainKind.safeParse(c.req.param("kind"));
  const chain = c.req.param("chain") ?? "";
  const subject = Subject.safeParse(c.req.param("subject"));
  const realm = subject.success ? RealmPath.safeParse(subject.data) : undefined;
  return kind.success && ChainId.safeParse(chain).success && realm?.success === true
    ? { kind: kind.data, chain, subject: realm.data }
    : undefined;
}

export function explainRoutes({ explainer, proxy, now, keys = 100_000 }: ExplainRoutesOptions): Hono {
  const byVisitor = limiter({ max: PER_MINUTE, windowMs: 60_000, keys });
  const together = limiter({ max: PER_SECOND, windowMs: 1000, keys: 1 });
  const routes = new Hono();
  routes.get("/:kind/:chain/:subject", (c) => {
    if (!byVisitor.take(visitorOf(c, proxy), now())) return c.json({ error: "too_many" }, 429);
    // Past every visitor's limit together, a line already made is still served: only a miss may start a making.
    const shared = together.take("all", now());
    c.header("cache-control", "no-store");
    const key = keyOf(c);
    if (!shared) {
      const ready = key === undefined ? undefined : explainer.ready(key);
      if (ready === undefined) return c.json({ error: "too_many" }, 429);
      c.header("cache-control", "public, max-age=300");
      return c.json(ready);
    }
    if (key === undefined) return c.json({ error: "refused" }, 400);
    // A day's new makings are counted by the visitor's /48, as the guests' and the links' are (D430).
    const answer = explainer.answer(key, visitor48Of(c, proxy));
    if (answer.status === "ready") c.header("cache-control", "public, max-age=300");
    return c.json(answer);
  });
  return routes;
}
