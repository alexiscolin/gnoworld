// A guest's line, judged by the server before the bot says it (D430): the room it may speak in, its mute, its rates, its rules, the
// provider's verdict, then the relay. Every limit is spent before the first await, so lines sent at once share the allowance.
import { GUEST_PREFIX } from "@gnoworld/core";
import { limiter } from "../limit.ts";
import { decide, type Thresholds } from "../moderation/decide.ts";
import type { Answer } from "../moderation/provider.ts";
import type { Rules } from "../roles/roles.ts";
import type { Log } from "@gnoworld/service/log";
import type { Said } from "../irc/lines.ts";
import type { Relayed } from "../irc/relay.ts";
import type { Access } from "./access.ts";
import type { Guest } from "./guests.ts";
import type { GuestMutes } from "./mutes.ts";
import { guestRules, guestVerdict, type GuestFault } from "./rules.ts";

type Cause = GuestFault | "moderation" | "muted" | "unchecked" | "relay" | "unsure";
type Status = 400 | 403 | 404 | 429 | 503;
export type Reply = { status: 200 } | { status: Status; error: string; cause?: Cause };

export interface SayDeps {
  now: () => number;
  log: Log;
  mutes: GuestMutes;
  /** What a guest may do in a room: write, read only, or nothing (a room it may not know). */
  access: (room: string, world: string) => Access;
  /** A room's world as the server's table holds it (a realm's room names its world by a short key). */
  worldOf: (room: string) => string | undefined;
  /** The world's own rules, none for a world the roles file does not list. */
  rulesOf: (world: string) => Rules | undefined;
  /** The roles file's defaults: their words join a world's, and they judge a world the file does not list. */
  defaults: Rules | undefined;
  /** OpenAI's check; none without a key. */
  provider: ((text: string) => Promise<Answer | "unchecked">) | undefined;
  thresholds: Thresholds;
  /** The bot's RELAYMSG: the id Ergo gave the line, a refusal, or no word in time. */
  relay: (room: string, nick: string, text: string) => Promise<Relayed>;
  /** A relayed line, counted in the plate's messages an hour and never in the history. */
  counted: (room: string, name: string, at: number) => void;
  /** A relayed line as the room heard it, kept among the recent lines, so it can be translated. */
  passed: (said: Said) => void;
}

// The faults of what was said, which a strike answers; a line too long or in two lines was no broken word.
const struck = (cause: Cause): boolean => ["banned_word", "links", "mentions", "control"].includes(cause);

export function makeSay(deps: SayDeps): (guest: Guest, room: string, text: string) => Promise<Reply> {
  const {
    now,
    log,
    mutes,
    access,
    worldOf,
    rulesOf,
    defaults,
    thresholds,
    relay,
    counted,
    passed,
    provider: ask,
  } = deps;
  const byName = limiter({ max: 6, windowMs: 60_000, keys: 100_000 });
  const byVisitor = limiter({ max: 12, windowMs: 60_000, keys: 100_000 });
  const byRoom = limiter({ max: 3, windowMs: 60_000, keys: 100_000 });
  const refused = (status: Status, error: string, cause?: Cause): Reply => {
    log("guest_refused", { status, ...(cause === undefined ? {} : { reason: cause }) });
    return { status, error, ...(cause === undefined ? {} : { cause }) };
  };
  // What a line meets before any await: the room, the mute, the three allowances, then the rules in force.
  const admit = (guest: Guest, room: string): Reply | { rules: Rules; world: string } => {
    const world = worldOf(room);
    const where = world === undefined ? undefined : access(room, world);
    if (where === undefined || world === undefined) return refused(404, "not_found");
    if (where === "read") return refused(403, "forbidden");
    if (mutes.muted(guest.visitor, world)) return refused(403, "forbidden", "muted");
    const at = now();
    const keys = [
      [byName, guest.name],
      [byVisitor, guest.visitor],
      [byRoom, `${guest.name}|${room}`],
    ] as const;
    // A line refused for one allowance spends none of the others: all three are looked at, then all three taken.
    if (keys.some(([each, key]) => each.full(key, at))) return refused(429, "too_many");
    for (const [each, key] of keys) each.take(key, at);
    const rules = guestRules(rulesOf(world), defaults);
    return rules === undefined ? refused(403, "forbidden") : { rules, world };
  };
  // The rules' verdict, then the provider's: the reply that refuses the line, or nothing.
  const judged = async (guest: Guest, { rules, world }: { rules: Rules; world: string }, text: string) => {
    const fault = guestVerdict(text, rules);
    if (fault !== undefined) {
      if (struck(fault)) mutes.strike(guest, world);
      return refused(400, "refused", fault);
    }
    const answer = await ask?.(text);
    if (answer === undefined || answer === "unchecked") return refused(503, "not_ready", "unchecked");
    if (decide(answer, thresholds).action === "pass") return undefined;
    mutes.strike(guest, world);
    return refused(400, "refused", "moderation");
  };
  // The bot's word: a rejection is a refusal, never a line the page may take for said.
  const taken = (room: string, nick: string, text: string): Promise<Relayed> =>
    relay(room, nick, text).catch(() => false);
  return async (guest, room, raw) => {
    const admitted = admit(guest, room);
    if ("status" in admitted) return admitted;
    // A pasted tab is a space: a household pasting a table is no control character.
    const text = raw.replaceAll("\t", " ").trim();
    const refusal = await judged(guest, admitted, text);
    if (refusal !== undefined) return refusal;
    const nick = `${GUEST_PREFIX}${guest.name}`;
    const sent = await taken(room, nick, text);
    if (sent === "unsure") return refused(503, "not_ready", "unsure");
    if (sent === false) return refused(503, "not_ready", "relay");
    const at = now();
    counted(room, guest.name, at);
    if (sent.msgid !== "") passed({ room, account: nick, msgid: sent.msgid, text });
    return { status: 200 };
  };
}
