// POST /api/jarvis/ask, the door (D42, D43, D44, D93, D13985): a question or a fixed ask to Jarvis from a room. Each check
// before any model call, cheapest first, each refusal a typed answer and a log line with no question: a listed site in JSON
// (guard.ts), the session, the switch, the rate, strikes (paused), the share (capped), the first ask (early), the body and
// size, the room's reading, the list (a strike), one question in flight (busy), then calls.ts: served answers, the room's
// cap (busy), the quota, jarvis. The share and `early` skip the allowlist, its strikes do not.
import { plainWords } from "@gnoworld/core";
import { z } from "zod";
import { JarvisQuestion, type Address, type JarvisAnswer, type JarvisAsk } from "@gnoworld/schemas";
import type { Context, Hono } from "hono";
import { getCookie } from "hono/cookie";
import { json, type Guarded } from "../guard.ts";
import { callsOf, forRelay, type Asked, type Called, type Result } from "./calls.ts";
import type { Day } from "./day.ts";
import { frontOf, type Front } from "./front.ts";
import type { Heard } from "./heard.ts";
import type { Jarvis } from "./jarvis.ts";
import type { Counted } from "./quota.ts";
import { refusedWithoutModel } from "./refuse.ts";
import { keysOf, type Kept } from "./kept.ts";
import type { Served } from "./served.ts";
import type { Answers } from "./said.ts";

interface Options extends Front, Counted<"take" | "giveBack" | "unlimited"> {
  // Whether an account may read a room (rooms/types.ts's mayRead, through the chat).
  mayRead: (room: string, who: string) => boolean;
  // A room's recent lines, numbered for the asker (lines.ts); an asker that is no account marks no speaker as 0.
  recent: (room: string, asker: string) => JarvisAsk["lines"];
  // A room's last line's id, in any room (lines.ts).
  last: (room: string) => string | undefined;
  // Whether the server heard the account speak in the chat, and when a session's token was signed (login.ts).
  heard: Heard["has"];
  // Whether the chat hears an account not heard yet within a moment: an ask sent with the account's first line comes before it.
  heardSoon?: (account: string) => Promise<boolean>;
  signedAt: (token: string | undefined) => number | undefined;
  // The hosts a link may name: the app's own and gno.land's, with their subdomains.
  hosts: readonly string[];
  day: Pick<Day, "strike" | "paused" | "spend" | "capped">;
  served: Pick<Served, "get" | "set">;
  kept: Pick<Kept, "get" | "set">;
  // The chain of a room's world, none for a room with none (chain.ts): a function is explained on it.
  chainOf: (room: string) => string | undefined;
  // The default universe's chain (chain.ts): a room with no chain of its own is read on it, and its answer is never kept.
  defaultChain: () => string | undefined;
  jarvis: Pick<Jarvis, "ask">;
  // Where an answered personal question is offered to be made public.
  said?: Pick<Answers, "offer">;
  questionChars: number;
  perMinute?: number;
}

const SESSION_MS = 10 * 60_000;
// Who asks, when, and whether the chat heard them speak.
interface Standing {
  who: Address;
  started: number;
  heard: boolean;
}
const route = "/api/jarvis/ask";
// An empty room's catch-up: nothing to sum up, so no model.
const EMPTY: JarvisAnswer = { status: "answered", markdown: "Nothing was said here yet.", buttons: [] };

// Whether the chat heard the account, waiting a moment for one not heard yet: its own line may come after its ask.
const heardOf = async ({ heard, heardSoon }: Pick<Options, "heard" | "heardSoon">, who: Address): Promise<boolean> =>
  heard(who) || ((await heardSoon?.(who)) ?? false);

// What a finished ask is told: when, where, by whom, and what was asked.
interface Told {
  started: number;
  ask: JarvisQuestion;
  more: { room: string; account: string };
}

// How long before its ask the asker's own line may have been heard: the line comes with the ask, or a moment before.
const HEARD_MS = 60_000;

// Whether the room's lines hold one the asker said, heard no earlier than that, with the question's words in it.
function saidInRoom(lines: JarvisAsk["lines"], question: string, started: number): boolean {
  const words = plainWords(question);
  return (
    words !== "" &&
    lines.some(
      ({ speaker, text, time }) =>
        speaker === 0 &&
        time !== undefined &&
        Date.parse(time) >= started - HEARD_MS &&
        plainWords(text).includes(words),
    )
  );
}

// A personal question's own answer, offered to the room once the room heard the question: never waited for, and never a fault of the
// asker's own answer. A question the room never heard, one an account only sent to the route, stays the asker's private card.
function offerAnswer(
  { said, log, recent }: Pick<Options, "said" | "log" | "recent">,
  called: Called,
  asked: Told,
): void {
  const { ask, started, more } = asked;
  const page = forRelay(called);
  if (said === undefined || !("question" in ask) || !page.ok || page.answer.status !== "answered") return;
  const { room, account: who } = more;
  const offered = { room, who, started, question: ask.question, answer: page.answer };
  void Promise.resolve()
    .then(() => (saidInRoom(recent(room, who), ask.question, started) ? said.offer(offered) : "private"))
    .catch(() => {
      log("jarvis_said", { room, account: who, reason: "failed" });
    });
}

export function askRoutes(options: Options): Hono<Guarded> {
  const { mayRead, recent, last, quota, now, day, hosts, log, questionChars } = options;
  const { app, refuse, admit, relay } = frontOf(options, { path: "/ask", perMinute: options.perMinute ?? 6 });
  const Question = z.string().max(questionChars);
  const calls = callsOf(options);
  // The accounts with a question in flight: one at a time, a second answers busy and counts nothing.
  const inFlight = new Set<string>();
  const say = (c: Context, status: string, more: { room?: string; account: string }) => {
    log(`jarvis_${status}`, { route, status: 200, ...more });
    return c.json({ status });
  };
  // Paused, capped or early: an answer that ends the request, or none.
  const standing = (c: Context, { who, started, heard }: Standing): Response | undefined => {
    if (day.paused(who, started)) return say(c, "paused", { account: who });
    if (quota.unlimited(who)) return undefined;
    if (day.capped(who, started)) return say(c, "capped", { account: who });
    const born = options.signedAt(getCookie(c, "__Host-session"));
    const aged = born !== undefined && started - born >= SESSION_MS;
    return heard && aged ? undefined : say(c, "early", { account: who });
  };
  // The ask the body holds, once its size, its room and the list let it through; else the answer that ends the request.
  const taken = async (c: Context, who: Address, started: number): Promise<Response | JarvisQuestion> => {
    const body = JarvisQuestion.safeParse(await json(c));
    if (!body.success) return refuse(c, "body", { account: who });
    const ask = body.data;
    if ("question" in ask && !Question.safeParse(ask.question).success) return refuse(c, "body", { account: who });
    if (!mayRead(ask.room, who)) return refuse(c, "room", { room: ask.room, account: who });
    if ("question" in ask && refusedWithoutModel(ask.question, hosts)) {
      day.strike(who, started);
      return say(c, "declined", { room: ask.room, account: who });
    }
    return ask;
  };
  const answered = (c: Context, answer: JarvisAnswer, more: { room: string; account: string }) => {
    log("jarvis_served", { route, status: 200, ...more });
    return c.json(answer);
  };
  app.post("/ask", async (c) => {
    const who = admit(c);
    if (who instanceof Response) return who;
    const asker = { who, heard: await heardOf(options, who), started: now() };
    const { started } = asker;
    const stopped = standing(c, asker);
    if (stopped !== undefined) return stopped;
    const ask = await taken(c, who, started);
    if (ask instanceof Response) return ask;
    const more = { room: ask.room, account: who };
    if ("ask" in ask && ask.ask === "catch-up" && recent(ask.room, "").length === 0) return answered(c, EMPTY, more);
    // Read again: the body may have waited while another answer landed, and nothing is awaited from here to `launch`.
    const again = standing(c, asker);
    if (again !== undefined) return again;
    if (inFlight.has(who)) return say(c, "busy", more);
    return finish(c, await launch(who, ask, started), { started, ask, more });
  });
  const launch = async (who: Address, ask: JarvisQuestion, started: number): Promise<Result> => {
    const tail = last(ask.room);
    const own = "ask" in ask && ask.ask === "function" ? options.chainOf(ask.room) : undefined;
    const asked: Asked = {
      ...keysOf(ask, { last: tail, account: who, chain: own }),
      chain: own ?? ("ask" in ask && ask.ask === "function" ? options.defaultChain() : undefined),
      who,
      room: ask.room,
      started,
      heard: tail !== undefined,
      ask,
    };
    inFlight.add(who);
    return await calls(asked).finally(() => inFlight.delete(who));
  };
  const finish = (c: Context, result: Result, asked: Told) => {
    switch (result.kind) {
      case "served":
        return answered(c, result.answer, asked.more);
      case "busy":
        return say(c, "busy", asked.more);
      case "full":
        return refuse(c, "quota", asked.more);
      case "called":
        offerAnswer(options, result.called, asked);
        return relay(c, forRelay(result.called), { started: asked.started, ...asked.more });
    }
  };
  return app;
}
