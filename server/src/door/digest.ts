// POST /api/jarvis/digest (10k; ADR-0002 §4, "What a realm shows: a digest"): a realm's digest, the same for every
// reader. Each check before any work, in this order: a listed site in JSON, the session (D195), the switch, the
// account's rate, the body (a universe and a realm's path), a question of the account's quota taken; then jarvis, which
// reads the realm on its universe's node, its answer passed on once the client's schema parsed it. The question is
// given back when jarvis made nothing for it: its cache, its budget spent, its refusal (10k-1, D195).
import type { Hono } from "hono";
import type { Jarvis } from "./jarvis.ts";
import type { Counted } from "./quota.ts";
import { JarvisDigestRequest } from "@gnoworld/schemas";
import { json, type Guarded } from "../guard.ts";
import { frontOf, type Front } from "./front.ts";

// The questions' quota, by the account's mainnet name.
interface Options extends Front, Counted<"take" | "giveBack"> {
  jarvis: Pick<Jarvis, "digest">;
  perMinute?: number;
}

export function digestRoutes(options: Options): Hono<Guarded> {
  const { jarvis, quota, named, now } = options;
  const { app, refuse, admit, relay } = frontOf(options, { path: "/digest", perMinute: options.perMinute ?? 10 });
  app.post("/digest", async (c) => {
    const who = admit(c);
    if (who instanceof Response) return who;
    const body = JarvisDigestRequest.safeParse(await json(c));
    if (!body.success) return refuse(c, "body", { account: who });
    // Taken before jarvis is asked, in the one statement that refuses it: a page that leaves, or asks many at once, pays.
    if (!quota.take(who, await named(who))) return refuse(c, "quota", { account: who });
    const started = now();
    const called = await jarvis.digest(body.data, c.req.raw.signal);
    if (called.ok ? !("made" in called.answer && called.answer.made) : called.error === "refused") quota.giveBack(who);
    return relay(c, called, { started, account: who });
  });
  return app;
}
