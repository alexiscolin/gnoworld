// Who makes an explanation, and when: asked for a subject, the table answers; a miss with Jarvis on starts one making, once, within a rate across
// every visitor and a cap of new makings a day, both counted before any call. The line Jarvis gives is checked before it is kept; a line that is
// not sure or fails the check is refused for good (this prompt version), a call that fails is tried again after a longer wait each time.
import { REALM_EXPLAIN_VERSION, tagsOf, type Explanation, type RealmTag } from "@gnoworld/schemas";
import type { Log } from "@gnoworld/service/log";
import type { Jarvis } from "../door/jarvis.ts";
import { checkLine } from "./check.ts";
import type { Explanations, Key, Row } from "./store.ts";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// A call that outlives this is stopped; a making not ended a minute past it is stale and may be made again.
const CALL_MS = 120_000;
const RETRY_FIRST_MS = 10 * 60_000;
const RETRY_LAST_MS = 6 * HOUR;
// A subject whose making failed this many times is refused for this prompt version: a realm that always fails never spends the cap again.
const TRIES = 3;

interface Parts {
  store: Explanations;
  // None while Jarvis is off or has no door: nothing is started, what was made still shows.
  jarvis: Pick<Jarvis, "explain"> | undefined;
  now: () => number;
  log: Log;
  /** Whether the server lists the subject on its chain: only such a subject is made, so a visitor cannot spend the day on a path that is no realm. */
  known: (key: Key) => boolean;
  /** The most new makings in a day. */
  perDay: number;
  /** The least time between two makings starting, whoever asks. */
  gapMs: number;
}

type Ended =
  | { kind: "ready"; line: { text: string; tags: RealmTag[]; model: string } }
  | { kind: "refused" | "failed"; reason: string };

// What Jarvis's call comes to: a line the check lets through, a line refused for good, or a failure to try again.
function endOf(called: Awaited<ReturnType<Jarvis["explain"]>>): Ended {
  if (!called.ok) return { kind: "failed", reason: called.error };
  const { answer } = called;
  if (answer.status !== "explained") return { kind: "failed", reason: answer.status };
  if (answer.version !== REALM_EXPLAIN_VERSION) return { kind: "failed", reason: "version" };
  if (!answer.sure) return { kind: "refused", reason: "unclear" };
  const checked = checkLine(answer.text);
  if (!checked.ok) return { kind: "refused", reason: checked.reason };
  return { kind: "ready", line: { text: checked.text, tags: tagsOf(answer.tags), model: answer.model } };
}

// What the table already says for a subject, none when a making may start: a miss, a failed row due again or a making gone stale.
function heldOf(row: Row | undefined, at: number): Explanation | undefined {
  if (row === undefined) return undefined;
  if (row.state === "ready") return row.text === null ? undefined : { status: "ready", text: row.text, tags: row.tags };
  if (row.state === "refused") return { status: "none" };
  if (row.nextTry <= at) return undefined;
  return { status: row.state === "making" ? "making" : "none" };
}

export function makeExplainer({ store, jarvis, known, now, log, perDay, gapMs }: Parts) {
  const running = new Set<Promise<void>>();
  const state = { last: -Infinity };
  const retryAfter = (tries: number): number => Math.min(RETRY_LAST_MS, RETRY_FIRST_MS * 2 ** Math.max(0, tries - 1));
  const settle = (key: Key, end: Ended): void => {
    if (end.kind === "ready") {
      store.keep(key, { ...end.line, now: now() });
      log("explain_ready", { setting: key.kind });
    } else if (end.kind === "refused") {
      store.refuse(key);
      log("explain_refused", { reason: end.reason });
    } else {
      const tries = store.get(key)?.tries ?? 1;
      if (tries >= TRIES) store.refuse(key);
      else store.failedAt(key, now() + retryAfter(tries));
      log("explain_failed", { reason: end.reason, value: tries });
    }
  };
  const run = async (key: Key, call: Pick<Jarvis, "explain">): Promise<void> => {
    try {
      const called = await call.explain({ chain: key.chain, realm: key.subject }, AbortSignal.timeout(CALL_MS));
      settle(key, endOf(called));
    } catch {
      settle(key, { kind: "failed", reason: "threw" });
    }
  };
  const start = (key: Key, call: Pick<Jarvis, "explain">): boolean => {
    const at = now();
    if (at - state.last < gapMs || store.startedSince(at - DAY + 1) >= perDay) return false;
    if (!store.claim(key, { now: at, until: at + CALL_MS + 60_000 })) return false;
    state.last = at;
    const making = run(key, call).finally(() => running.delete(making));
    running.add(making);
    log("explain_started", { setting: key.kind });
    return true;
  };
  return {
    /** What a page reads for a subject: its line, a making that is under way, or none. Starts a making on a miss when it may. */
    answer(asked: Key): Explanation {
      // A world's line is its main realm's, so it is the realm's row: one making for both.
      const key: Key = { ...asked, kind: "realm" };
      const held = heldOf(store.get(key), now());
      if (held !== undefined) return held;
      if (jarvis === undefined || !known(key) || !start(key, jarvis)) return { status: "none" };
      return { status: "making" };
    },
    /** Every making started has ended. */
    idle: async (): Promise<void> => {
      while (running.size > 0) await Promise.all(running);
    },
  };
}
