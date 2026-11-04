// POST /api/jarvis/digest (10k; ADR-0002 §4, "What a realm shows: a digest"): a realm's digest, the same for every
// reader. Each check before any work, in this order: a listed site in JSON, the session (D195), the switch, the
// account's rate, the body (a universe and a realm's path); then jarvis, which reads the realm on its universe's node,
// its answer passed on once the client's schema parsed it. No room and no quota: jarvis makes a realm's digest at most
// once in 10 minutes for every reader, on the questions' budget (D193).
import { JarvisDigestRequest } from "@gnoworld/schemas";
import type { Hono } from "hono";
import { json, type Guarded } from "../guard.ts";
import { frontOf, type Front } from "./front.ts";
import type { Jarvis } from "./jarvis.ts";

interface Options extends Front {
  jarvis: Pick<Jarvis, "digest">;
  perMinute?: number;
}

export function digestRoutes(options: Options): Hono<Guarded> {
  const { jarvis, now } = options;
  const { app, refuse, admit, relay } = frontOf(options, { path: "/digest", perMinute: options.perMinute ?? 10 });
  app.post("/digest", async (c) => {
    const who = admit(c);
    if (who instanceof Response) return who;
    const body = JarvisDigestRequest.safeParse(await json(c));
    if (!body.success) return refuse(c, "body", { account: who });
    const started = now();
    return relay(c, await jarvis.digest(body.data, c.req.raw.signal), { started, account: who });
  });
  return app;
}
