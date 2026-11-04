// POST /api/jarvis/ask, the door (D42, D43, D44, D93): a question to Jarvis from a room. Each check before any work, in
// this order, each refusal a typed answer and a log line that holds no question: a listed site in JSON (guard.ts), the
// session, the account's rate, the body and the question's cap (a setting, in code points as Zod counts), a room the asker
// may read and its recent lines, the account's quota by its mainnet name; then jarvis, whose answer is passed on only once
// it parses with the client's schema. Logs name the account by its HMAC alone (log.ts).
import { z } from "zod";
import { JarvisQuestion, type Address, type JarvisAsk } from "@gnoworld/schemas";
import type { Hono } from "hono";
import { json, type Guarded } from "../guard.ts";
import { frontOf, type Front } from "./front.ts";
import type { Jarvis } from "./jarvis.ts";
import type { Quota } from "./quota.ts";

interface Options extends Front {
  // Whether an account may read a room (rooms/types.ts's mayRead, through the chat).
  mayRead: (room: string, who: string) => boolean;
  // A room's recent lines, numbered for the asker (lines.ts).
  recent: (room: string, asker: string) => JarvisAsk["lines"];
  // Whether the account has a mainnet name; false whenever that could not be read (names.ts).
  named: (account: Address) => Promise<boolean>;
  quota: Pick<Quota, "take">;
  jarvis: Pick<Jarvis, "ask">;
  questionChars: number;
  perMinute?: number;
}

export function askRoutes(options: Options): Hono<Guarded> {
  const { mayRead, recent, named, quota, jarvis, questionChars, now } = options;
  const { app, refuse, admit, relay } = frontOf(options, { path: "/ask", perMinute: options.perMinute ?? 6 });
  const Question = z.string().max(questionChars);
  app.post("/ask", async (c) => {
    const who = admit(c);
    if (who instanceof Response) return who;
    const body = JarvisQuestion.safeParse(await json(c));
    if (!body.success || !Question.safeParse(body.data.question).success) return refuse(c, "body", { account: who });
    const { question, room } = body.data;
    if (!mayRead(room, who)) return refuse(c, "room", { room, account: who });
    const lines = recent(room, who);
    if (!quota.take(who, await named(who))) return refuse(c, "quota", { room, account: who });
    const started = now();
    return relay(c, await jarvis.ask({ question, room, lines }, c.req.raw.signal), { started, room, account: who });
  });
  return app;
}
