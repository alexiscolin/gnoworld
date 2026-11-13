// GET /api/translations?room&ids&language: the stored translations of lines older than the stream's replay. Each check before any work, in
// this order: a listed site, the visitor's rate, the body, the right to read the room, then the flow, which makes a missing line for a
// signed-in reader alone (never for a guest).
import { LineTranslations, RoomId, VerdictId, JARVIS_LANGUAGES, TRANSLATIONS_ASKED } from "@gnoworld/schemas";
import { Hono } from "hono";
import { z } from "zod";
import { baseRefusals, guard, refuserOf, sessionOf, type Guarded, type Refusals } from "../guard.ts";
import type { CardRoutesOptions } from "../cards/routes.ts";
import { limiter } from "../limit.ts";
import { once } from "../stream/stream.ts";
import { visitorOf } from "../visitor.ts";
import type { TranslationFlow } from "./flow.ts";

const ASKS_PER_MINUTE = 60;

export interface TranslationRoutesOptions extends Pick<
  CardRoutesOptions,
  "readable" | "session" | "proxy" | "origins" | "log" | "now"
> {
  flow: Pick<TranslationFlow, "asked">;
}

const refusals = { ...baseRefusals, forbidden: ["forbidden", 403] } as const satisfies Refusals;

const Ids = z
  .string()
  .transform((list) => list.split(","))
  .pipe(z.array(VerdictId).min(1).max(TRANSLATIONS_ASKED));

export function translationRoutes({
  flow,
  readable,
  session,
  proxy,
  origins,
  log,
  now,
}: TranslationRoutesOptions): Hono<Guarded> {
  const asks = limiter({ max: ASKS_PER_MINUTE, windowMs: 60_000, keys: 100_000 });
  const refuse = refuserOf(log, "translation_refused", refusals);
  const app = new Hono<Guarded>();
  app.use(guard(origins, refuse));
  app.get("/", async (c) => {
    if (!asks.take(visitorOf(c, proxy), now())) return refuse(c, "limit");
    const room = RoomId.safeParse(once(c.req.queries("room")));
    const ids = Ids.safeParse(once(c.req.queries("ids")));
    const language = z.enum(JARVIS_LANGUAGES).safeParse(once(c.req.queries("language")));
    if (!room.success || !ids.success || !language.success) return refuse(c, "body");
    const who = sessionOf(c, session);
    if (!readable(room.data, who)) return refuse(c, "forbidden", { room: room.data });
    const answer = await flow.asked({
      room: room.data,
      ids: ids.data,
      language: language.data,
      signedIn: who !== undefined,
      account: who,
    });
    c.header("cache-control", "no-store");
    return c.json(answer satisfies LineTranslations);
  });
  return app;
}
