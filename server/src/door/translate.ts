// POST /api/jarvis/translate (10k; ADR-0002 §5, "Translation"): a room's line in a language, for one reader. Each check
// before any work, in this order: a listed site in JSON, the session, the switch, the account's rate, the body (a room,
// a line's id, a language of the list), a room the asker may read, the line in the server's own record of that room;
// then jarvis, given that record's text, never one the page sent, its answer passed on once the client's schema parsed
// it. No quota of questions: a translation spends its own budget, made once for every reader; an account asks 200 a
// UTC day at most, so one account alone cannot spend that budget (D194).
import { JarvisTranslateRequest } from "@gnoworld/schemas";
import type { Hono } from "hono";
import { json, type Guarded } from "../guard.ts";
import { limiter } from "../limit.ts";
import { frontOf, type Front } from "./front.ts";
import type { Jarvis } from "./jarvis.ts";

interface Options extends Front {
  // Whether an account may read a room (rooms/types.ts's mayRead, through the chat).
  mayRead: (room: string, who: string) => boolean;
  // A line's text while its room keeps it (lines.ts): a public room's last lines moderation let through.
  line: (room: string, msgid: string) => string | undefined;
  jarvis: Pick<Jarvis, "translate">;
  perMinute?: number;
}

export function translateRoutes(options: Options): Hono<Guarded> {
  const { mayRead, line, jarvis, now } = options;
  const { app, refuse, admit, relay } = frontOf(options, { path: "/translate", perMinute: options.perMinute ?? 30 });
  const daily = limiter({ max: 200, windowMs: 24 * 60 * 60_000, keys: 100_000 });
  app.post("/translate", async (c) => {
    const who = admit(c);
    if (who instanceof Response) return who;
    if (!daily.take(who, now())) return refuse(c, "quota", { account: who });
    const body = JarvisTranslateRequest.safeParse(await json(c));
    if (!body.success) return refuse(c, "body", { account: who });
    const { room, msgid, language } = body.data;
    if (!mayRead(room, who)) return refuse(c, "room", { room, account: who });
    const text = line(room, msgid);
    if (text === undefined) return refuse(c, "line", { room, account: who });
    const started = now();
    return relay(c, await jarvis.translate({ text, language }, c.req.raw.signal), { started, room, account: who });
  });
  return app;
}
