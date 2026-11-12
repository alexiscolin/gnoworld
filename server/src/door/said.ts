// Jarvis's public, kept answers (D13067, D13089): an answer to a personal question, judged like a guest's line (the room's
// rules, the provider), said once under Jarvis's nick as a plain excerpt, and kept by its line's id so every reader draws the card.
// A members room's answer, a refused one and any fault stay the asker's private card, and never strike the asker: the words are the
// model's. Readers get the fly buttons alone. Allowances are spent before the first await.
import type { DatabaseSync } from "node:sqlite";
import { JARVIS_NICK } from "@gnoworld/core";
import { DOOR_CAPS, shortAddress, type AnswerButton, type JarvisAnswer } from "@gnoworld/schemas";

type FlyButton = Extract<AnswerButton, { type: "fly" }>;
import { Hono } from "hono";
import type { Log } from "@gnoworld/service/log";
import { guestVerdict, type GuestFault } from "../guest/rules.ts";
import type { Guarded } from "../guard.ts";
import type { Relayed } from "../irc/relay.ts";
import { limiter } from "../limit.ts";
import { decide, type Thresholds } from "../moderation/decide.ts";
import { ruleVerdict } from "../moderation/rules.ts";
import type { Answer } from "../moderation/provider.ts";
import { remember } from "../remember.ts";
import type { Rules } from "../roles/roles.ts";
import { frontOf, type Front } from "./front.ts";
import { allowedLinks, excerptOf } from "./saidText.ts";
import { SAID_MAX, saidStore, type Answered } from "./saidStore.ts";

export { SAID_TABLES } from "./saidStore.ts";

// The lines dropped before their answer was kept, remembered: the oldest forgotten first.
const GONE = 2000;
const READS_PER_MINUTE = 120;
// The links an answer may hold, as a line's own limit of links in the rooms that allow them.
const MAX_LINKS = 3;

/** One answered personal question, as the door hands it on. */
export interface Offered {
  room: string;
  who: string;
  started: number;
  question: string;
  answer: Answered;
}

export interface SaidDeps {
  now: () => number;
  log: Log;
  isPublic: (room: string) => boolean;
  /** A guest's rules in the room: its world's and the defaults', none for a room with neither. */
  rulesOf: (room: string) => Rules | undefined;
  provider: ((text: string) => Promise<Answer | "unchecked">) | undefined;
  thresholds: Thresholds;
  relay: (room: string, nick: string, text: string) => Promise<Relayed>;
  hosts: readonly string[];
  maxRows?: number;
  maxBytes?: number;
}

/** The line a taken or edited line stood for: who said it and what, so the answer to a question in it goes too. */
interface Taken {
  account: string;
  text: string;
}

export interface Answers {
  /** Said publicly and kept when it passes every check, else the answer stays the asker's private card. */
  offer: (offered: Offered) => Promise<"public" | "private">;
  get: (room: string, msgid: string) => JarvisAnswer | undefined;
  /** Who asked for the answer kept for a line, as its short address. */
  asker: (room: string, msgid: string) => string | undefined;
  /** The answer said as this line goes; and, with the line, the latest answer to a question that line held, by its speaker. */
  drop: (room: string, msgid: string, line?: Taken) => void;
  /** At most `limit` rows past their time, then over the caps, the oldest first; the count taken. */
  expire: (limit: number) => number;
}

// What every reader is told of an answer: its markdown and its fly buttons alone, a place and a label; an action stays the asker's.
const toldOf = ({ markdown, buttons }: Answered): Answered => ({
  status: "answered",
  markdown,
  buttons: buttons.filter((button): button is FlyButton => button.type === "fly"),
});
// All the words a reader would see: the markdown and each label, judged and sent to the provider together.
const wordsOf = ({ markdown, buttons }: Answered): string =>
  [markdown, ...buttons.map(({ label }) => label)].join("\n");

// Controls, invisible marks and bidi overrides: none may stand in a line said under Jarvis's name.
const CONTROLS =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/;

// The fault of an answer, or the excerpt to say: its characters, its links, the rules on all of it and its labels, then on the excerpt.
function judged(answer: Answered, rules: Rules, hosts: readonly string[]): { fault: string } | { excerpt: string } {
  const { markdown } = answer;
  const whole = wordsOf(answer);
  if (Array.from(markdown).length > DOOR_CAPS.answer) return { fault: "too_long" };
  if (!whole.isWellFormed() || CONTROLS.test(whole)) return { fault: "control" };
  const links = allowedLinks(whole, hosts);
  if (links === undefined || links > MAX_LINKS) return { fault: "links" };
  const none = { ...rules, linksPerMessage: 0, mentionsPerMessage: 0, linksForNewAccount: 0 };
  const held = { ...none, linksPerMessage: links, linksForNewAccount: links };
  const reason = ruleVerdict(whole, held, { newAccount: false });
  if (reason !== undefined) return { fault: reason === "banned_word" || reason === "mentions" ? reason : "links" };
  const excerpt = excerptOf(markdown);
  const fault: GuestFault | undefined = guestVerdict(excerpt, none);
  return fault === undefined ? { excerpt } : { fault };
}

export function makeSaid(db: DatabaseSync, deps: SaidDeps): Answers {
  const { now, log, isPublic, rulesOf, provider, thresholds, relay, hosts } = deps;
  const store = saidStore(db, {
    now,
    maxRows: deps.maxRows ?? SAID_MAX.rows,
    maxBytes: deps.maxBytes ?? SAID_MAX.bytes,
  });
  const byRoom = limiter({ max: 3, windowMs: 60_000, keys: 100_000 });
  const byAccount = limiter({ max: 6, windowMs: 60_000, keys: 100_000 });
  // One person's answers cannot fill a room's three: a second in the same room waits its minute.
  const byBoth = limiter({ max: 1, windowMs: 60_000, keys: 100_000 });
  const gone = new Map<string, true>();
  const key = (room: string, msgid: string): string => JSON.stringify([room, msgid]);
  const refuse = ({ room, who }: Offered, reason: string): "private" => {
    log("jarvis_said", { room, account: who, reason });
    return "private";
  };
  // Everything before the first await: the room, the answer's own faults, then the two allowances, all looked at, then both taken.
  const admitted = ({ room, who }: Offered, answer: Answered): { excerpt: string } | { fault: string } => {
    const rules = isPublic(room) ? rulesOf(room) : undefined;
    if (rules === undefined) return { fault: "room" };
    const verdict = judged(answer, rules, hosts);
    if ("fault" in verdict) return verdict;
    const at = now();
    const both = key(room, who);
    if (byRoom.full(room, at) || byAccount.full(who, at) || byBoth.full(both, at)) return { fault: "allowance" };
    byRoom.take(room, at);
    byAccount.take(who, at);
    byBoth.take(both, at);
    return verdict;
  };
  // The provider's word on the whole answer: a failure keeps it private, only a flag is the asker's strike.
  const checked = async (text: string): Promise<"pass" | "moderation" | "unchecked"> => {
    const answer = await provider?.(text).catch(() => "unchecked" as const);
    if (answer === undefined || answer === "unchecked") return "unchecked";
    return decide(answer, thresholds).action === "pass" ? "pass" : "moderation";
  };
  const keep = ({ room, who, question }: Offered, answer: Answered, msgid: string): boolean =>
    !gone.has(key(room, msgid)) && store.set({ room, msgid, asker: who, question, answer });
  return {
    async offer(offered) {
      // Only what the page may read: never a field the call's answer may carry besides these.
      const answer = toldOf(offered.answer);
      const verdict = admitted(offered, answer);
      if ("fault" in verdict) return verdict.fault === "room" ? "private" : refuse(offered, verdict.fault);
      const word = await checked(wordsOf(answer));
      if (word !== "pass") return refuse(offered, word);
      const sent = await relay(offered.room, JARVIS_NICK, verdict.excerpt).catch(() => false as const);
      if (sent === false || sent === "unsure" || sent.msgid === "") return refuse(offered, "relay");
      return keep(offered, answer, sent.msgid) ? "public" : refuse(offered, "kept");
    },
    get: (room, msgid) => store.get(room, msgid)?.answer,
    asker: (room, msgid) => {
      const asker = store.get(room, msgid)?.asker;
      return asker === undefined ? undefined : shortAddress(asker);
    },
    drop(room, msgid, line) {
      remember(gone, [key(room, msgid), true], GONE);
      store.drop(room, msgid);
      if (line !== undefined) store.dropAsked(room, line.account, line.text);
    },
    expire: (limit) => store.expire(limit),
  };
}

// The room and the line a read names, each once and well formed; none otherwise.
function nameOf(rooms: readonly string[], ids: readonly string[]): { room: string; id: string } | undefined {
  const [room, id] = [rooms[0] ?? "", ids[0] ?? ""];
  const fine =
    rooms.length === 1 && ids.length === 1 && /^#[^\s,\0-\x1f\x7f]{1,63}$/.test(room) && /^[\w.:=-]{1,128}$/.test(id);
  return fine ? { room, id } : undefined;
}

export function saidRoutes(
  options: Front & { mayRead: (room: string, who: string) => boolean; said: Pick<Answers, "get" | "asker"> },
): Hono<Guarded> {
  const { app, refuse, admit } = frontOf(options, { path: "/said", perMinute: READS_PER_MINUTE });
  app.get("/said", (c) => {
    const who = admit(c);
    if (who instanceof Response) return who;
    const named = nameOf(c.req.queries("room") ?? [], c.req.queries("id") ?? []);
    if (named === undefined) return refuse(c, "body", { account: who });
    // A room the asker may not read and a line with no answer look alike.
    const readable = options.mayRead(named.room, who);
    const answer = readable ? options.said.get(named.room, named.id) : undefined;
    const asker = readable ? options.said.asker(named.room, named.id) : undefined;
    return answer === undefined || asker === undefined
      ? refuse(c, "line", { room: named.room, account: who })
      : c.json({ answer, asker });
  });
  return app;
}
