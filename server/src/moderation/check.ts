// Checking one message (slice 3's plan, 3i): claimed by its id first, so it is checked once even when
// the live line and a catch-up race, an unchecked one again when it comes back; then its world's rules,
// the provider and the decision. Each verdict keeps what it used, the account as its HMAC, never the text.
import { createHmac } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { Said } from "../irc/link.ts";
import type { Log } from "../log.ts";
import type { Rules } from "../roles/roles.ts";
import { decide, type Thresholds } from "./decide.ts";
import { editsOwn, lineKnown } from "./edits.ts";
import type { Answer, Category } from "./provider.ts";
import { lineRate } from "./rate.ts";
import { ruleVerdict, type RuleReason } from "./rules.ts";

export const VERDICT_TABLES = `
CREATE TABLE verdicts (
  msgid TEXT PRIMARY KEY,
  room TEXT NOT NULL,
  account TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT,
  flags TEXT,
  scores TEXT,
  thresholds TEXT,
  at INTEGER NOT NULL
) STRICT;
CREATE INDEX verdicts_by_time ON verdicts (at);
`;

export type Verdict = { action: "hide"; reason: RuleReason | Category } | { action: "pass" } | { action: "unchecked" };

interface Options {
  db: DatabaseSync;
  rulesOf: (room: string) => Rules | undefined;
  // None without a key: every message is then unchecked, and nothing leaves.
  provider: ((text: string) => Promise<Answer | "unchecked">) | undefined;
  // A room whose lines may go to the provider (3m: a members room's never leave), all by default.
  publicRoom?: (room: string) => boolean;
  thresholds: Thresholds;
  pepper: string;
  log: Log;
  now?: () => number;
  newAccountMs?: number;
}

/** The provider behind a breaker: five failures running leave it alone for 30 seconds, the messages
 * unchecked; one more failure after the pause pauses it again at once. A throw is a failure. */
function withBreaker(
  provider: (text: string) => Promise<Answer | "unchecked">,
  { now, log }: { now: () => number; log: Log },
): (text: string) => Promise<Answer | "unchecked"> {
  const breaker = { failures: 0, until: 0 };
  const failed = (): void => {
    // Already paused by a probe that failed alongside: one pause, one alert.
    if (now() < breaker.until) return;
    breaker.failures += 1;
    if (breaker.failures < 5 && breaker.until === 0) return;
    breaker.failures = 0;
    breaker.until = now() + 30_000;
    log("alert", { error: "moderation_breaker" });
  };
  return async (text) => {
    if (now() < breaker.until) return "unchecked";
    let answer: Answer | "unchecked";
    try {
      answer = await provider(text);
    } catch {
      answer = "unchecked";
    }
    if (answer === "unchecked") failed();
    else [breaker.failures, breaker.until] = [0, 0];
    return answer;
  };
}

/** An account as the verdicts keep it: its HMAC under the pepper, never the address. */
export const accountKey = (pepper: string, account: string): string =>
  createHmac("sha256", pepper).update(account).digest("hex");

/** A line's time: Ergo's server-time when it set one, so a caught-up backlog keeps its own pace (3k). */
export const lineTime = (said: Said, now: () => number): number =>
  said.time === undefined ? now() : Date.parse(said.time);

// More lines than this in a minute of Ergo's time are too fast (3k): twice 3h's activity cap, which
// counts a room's heat, not a fault.
const RATE = { lines: 20, ms: 60_000 };

/** A hide that could not be done: the line is checked again when it comes back (3j). */
export function checkAgain(db: DatabaseSync, msgid: string): void {
  db.prepare("UPDATE verdicts SET action = 'unchecked' WHERE msgid = ?").run(msgid);
}

/** "seen": the line has its verdict; "busy": another run is checking it now, and settles it. */
export function makeChecker(options: Options): (said: Said) => Promise<Verdict | "seen" | "busy"> {
  const { db, rulesOf, provider, thresholds, pepper, log, now = Date.now, newAccountMs = 24 * 60 * 60_000 } = options;
  const { publicRoom = () => true } = options;
  const sql = {
    claim: db.prepare(
      "INSERT OR IGNORE INTO verdicts (msgid, room, account, action, at) VALUES (?, ?, ?, 'pending', ?)",
    ),
    retry: db.prepare("UPDATE verdicts SET action = 'pending', at = ? WHERE msgid = ? AND action = 'unchecked'"),
    settle: db.prepare(
      "UPDATE verdicts SET action = ?, reason = ?, flags = ?, scores = ?, thresholds = ? WHERE msgid = ?",
    ),
    firstSeen: db.prepare("SELECT first_seen FROM accounts WHERE address = ?"),
    // Counted up to one past the limit: an account's flood costs no more than the limit to measure.
    recent: db.prepare(
      "SELECT count(*) AS n FROM (SELECT 1 FROM verdicts WHERE account = ? AND at > ? AND at <= ? LIMIT ?)",
    ),
    pending: db.prepare("SELECT 1 FROM verdicts WHERE msgid = ? AND action = 'pending'"),
  };
  const Count = z.object({ n: z.number() });
  const owns = editsOwn(db);
  // The lines an account sent in the last minute, a message of several lines counting each (rate.ts).
  const lines = lineRate();
  // A line counts itself in its rate: it is claimed before the rules run.
  const tooFast = (key: string, at: number): boolean =>
    Count.parse(sql.recent.get(key, at - RATE.ms, at, RATE.lines + 1)).n > RATE.lines;
  const known = lineKnown(db);
  // An edit's line: none, its author's, another's, or one it never checked (F549).
  const editOf = ({ edits }: Said, key: string): "none" | "own" | "other" | "unknown" =>
    edits === undefined ? "none" : !known(edits) ? "unknown" : owns(edits, key) ? "own" : "other";
  const FirstSeen = z.object({ first_seen: z.number() }).optional();
  // A line a stopped process left pending is checked again when it comes back (one process: 3a's lock).
  db.prepare("UPDATE verdicts SET action = 'unchecked' WHERE action = 'pending'").run();
  const ask = provider === undefined ? undefined : withBreaker(provider, { now, log });
  // The world's rules, which a new account, a line too fast or another's edit may break.
  const byRules = (said: Said, rules: Rules, { hashed, at }: { hashed: string; at: number }) => {
    const manyLines = lines.add(hashed, { id: said.msgid, at, lines: said.text.split("\n").length });
    const firstSeen = FirstSeen.parse(sql.firstSeen.get(said.account))?.first_seen;
    const edit = editOf(said, hashed);
    return ruleVerdict(said.text, rules, {
      newAccount: firstSeen === undefined || at - firstSeen < newAccountMs,
      tooFast: tooFast(hashed, at) || manyLines,
      foreignEdit: edit === "other",
      unknownEdit: edit === "unknown",
    });
  };
  return async (said) => {
    const { room, account, msgid, text } = said;
    const at = lineTime(said, now);
    const hashed = accountKey(pepper, account);
    const claimed = sql.claim.run(msgid, room, hashed, at).changes > 0 || sql.retry.run(at, msgid).changes > 0;
    if (!claimed) return sql.pending.get(msgid) === undefined ? "seen" : "busy";
    const settle = (verdict: Verdict, { why, answer }: { why?: string; answer?: Answer } = {}): Verdict => {
      const reason = verdict.action === "hide" ? verdict.reason : (why ?? null);
      const used = answer === undefined ? [null, null, null] : [answer.flagged, answer.scores, thresholds];
      sql.settle.run(
        verdict.action,
        reason,
        ...used.map((part) => (part === null ? null : JSON.stringify(part))),
        msgid,
      );
      return verdict;
    };
    const rules = rulesOf(room);
    // A room no world of the file names sends nothing anywhere.
    if (rules === undefined) return settle({ action: "unchecked" }, { why: "unknown_room" });
    // A message of several lines the link could not read whole: Ergo relays and keeps it, so it is hidden unjudged.
    if (said.unreadable === true) return settle({ action: "hide", reason: "unreadable" });
    const reason = byRules(said, rules, { hashed, at });
    if (reason !== undefined) return settle({ action: "hide", reason });
    // Checked by its rules alone: the provider never reads it.
    if (!publicRoom(room)) return settle({ action: "pass" }, { why: "members_room" });
    if (ask === undefined) return settle({ action: "unchecked" }, { why: "no_key" });
    const answer = await ask(text);
    if (answer === "unchecked") return settle({ action: "unchecked" });
    return settle(decide(answer, thresholds), { answer });
  };
}
