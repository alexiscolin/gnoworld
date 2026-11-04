// POST /api/jarvis/digest (10k; ADR-0002 §4, "What a realm shows: a digest"): a realm's digest, the same for every
// reader. Each check before any work, in this order: a listed site in JSON, the session (D195), the switch, the
// account's rate, the body (a universe and a realm's path), a question of the account's quota taken; then jarvis, which
// reads the realm on its universe's node, its answer passed on once the client's schema parsed it. The question is
// given back when jarvis made nothing for it: its cache, its budget spent, its refusal (10k-1, D195).
import type { Hono } from "hono";
import type { Jarvis } from "./jarvis.ts";
import type { Counted } from "./quota.ts";
import { JarvisDigestRequest, type JarvisDigest, type JarvisMadeDigest } from "@gnoworld/schemas";
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
    // Given back to the day it was taken, whenever jarvis answers (U1).
    const started = now();
    if (!quota.take(who, await named(who), started)) return refuse(c, "quota", { account: who });
    const called = await jarvis.digest(body.data, c.req.raw.signal);
    const nothing = called.ok ? !("made" in called.answer && called.answer.made) : called.error === "refused";
    if (nothing) quota.giveBack(who, started);
    return relay(c, called.ok ? { ok: true, answer: shown(called.answer) } : called, { started, account: who });
  });
  return app;
}

// The page never learns whether the model made its digest, which tells that someone read the realm lately: `made` is the
// door's, for the quota (the second round's T3).
function shown(answer: JarvisMadeDigest): JarvisDigest {
  if (answer.status === "digest") {
    return { status: "digest", digest: answer.digest, proposal: answer.proposal, height: answer.height };
  }
  return answer.status === "none" ? { status: "none" } : answer;
}
