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
import type { Answer, Category } from "./provider.ts";
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

export function makeChecker(options: Options): (said: Said) => Promise<Verdict | "seen"> {
  const { db, rulesOf, provider, thresholds, pepper, log, now = Date.now, newAccountMs = 24 * 60 * 60_000 } = options;
  const sql = {
    claim: db.prepare(
      "INSERT OR IGNORE INTO verdicts (msgid, room, account, action, at) VALUES (?, ?, ?, 'pending', ?)",
    ),
    retry: db.prepare("UPDATE verdicts SET action = 'pending', at = ? WHERE msgid = ? AND action = 'unchecked'"),
    settle: db.prepare(
      "UPDATE verdicts SET action = ?, reason = ?, flags = ?, scores = ?, thresholds = ? WHERE msgid = ?",
    ),
    firstSeen: db.prepare("SELECT first_seen FROM accounts WHERE address = ?"),
  };
  const FirstSeen = z.object({ first_seen: z.number() }).optional();
  const ask = provider === undefined ? undefined : withBreaker(provider, { now, log });
  return async ({ room, account, msgid, text }) => {
    const at = now();
    const hashed = createHmac("sha256", pepper).update(account).digest("hex");
    const claimed = sql.claim.run(msgid, room, hashed, at).changes > 0 || sql.retry.run(at, msgid).changes > 0;
    if (!claimed) return "seen";
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
    const firstSeen = FirstSeen.parse(sql.firstSeen.get(account))?.first_seen;
    const reason = ruleVerdict(text, rules, { newAccount: firstSeen === undefined || at - firstSeen < newAccountMs });
    if (reason !== undefined) return settle({ action: "hide", reason });
    if (ask === undefined) return settle({ action: "unchecked" }, { why: "no_key" });
    const answer = await ask(text);
    if (answer === "unchecked") return settle({ action: "unchecked" });
    return settle(decide(answer, thresholds), { answer });
  };
}
