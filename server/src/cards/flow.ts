// The link cards' flow (slice 13, L3; docs/plans/link-previews.md §3): a line that passed moderation, its first https link read by the link
// reader, the card's text and picture checked in one call, then told. One fetch per URL per TTL, whoever posts it; nothing the page reads
// ever fetches. A card never exists before its check passed, and a line's removal sticks.
import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { cardLinkOf, GUEST_PREFIX, normalisedUrl } from "@gnoworld/core";
import type { CardEvent, LinkCard } from "@gnoworld/schemas";
import type { Log } from "@gnoworld/service/log";
import type { Said } from "../irc/link.ts";
import { limiter } from "../limit.ts";
import { accountKey } from "../moderation/check.ts";
import type { Thresholds } from "../moderation/decide.ts";
import type { Answer, ModerationInput } from "../moderation/provider.ts";
import { makeQueue } from "../moderation/queue.ts";
import { hiddenRoom, mayRead, type Typed } from "../rooms/types.ts";
import { expireCards, MAX_BYTES, MAX_ROWS } from "./expire.ts";
import { examine, type Job } from "./examine.ts";
import { CardStore, type Page } from "./store.ts";
import { Waiting, type Tied } from "./waiting.ts";

const MINUTE = 60_000;
// How long each state of a page is believed: a card or a refusal a day, a reader down an hour, an unchecked card five minutes.
const TTL = { passed: 24 * 60 * MINUTE, failed: 24 * 60 * MINUTE, down: 60 * MINUTE, unchecked: 5 * MINUTE } as const;

export interface CardFlowOptions {
  db: DatabaseSync;
  roles: Typed;
  pepper: string;
  /** The link reader's answer for a URL, unchecked data; it rejects when it is down. */
  reader: (url: string) => Promise<unknown>;
  /** The card's text and picture in one call, behind the chat's breaker. */
  check: (input: ModerationInput) => Promise<Answer | "unchecked">;
  thresholds: Thresholds;
  publish: (event: CardEvent) => void;
  log: Log;
  now: () => number;
  maxRows?: number;
  maxBytes?: number;
}

export interface CardFlow {
  /** A line moderation let through. */
  heard: (said: Said) => void;
  /** The line a REDACT took: its card goes. */
  redacted: (room: string, msgid: string) => void;
  /** An edit: the replaced line's card goes, and its removal passes to the edit. */
  edited: (said: Said) => void;
  idle: () => Promise<void>;
  stop: () => void;
  /** Lines waiting for a card's check. */
  waiting: () => number;
  lines: (room: string, ids: readonly string[]) => { msgid: string; key: string }[];
  content: (key: string) => LinkCard | undefined;
  picture: (key: string) => Uint8Array | undefined;
  known: (room: string, msgid: string) => boolean;
  isAuthor: (room: string, msgid: string, who: string) => boolean;
  remove: (room: string, msgid: string) => boolean;
  /** Retention: at most `limit` pages past 30 days or over the caps, oldest first; how many went. */
  expire: (limit: number) => number;
}

// 10 new pages per account in 10 minutes, 20 per host and 60 in all a minute; a page checked again from its stored answer costs the total alone.
function makeLimits(now: () => number) {
  const account = limiter({ max: 10, windowMs: 10 * MINUTE, keys: 100_000 });
  const host = limiter({ max: 20, windowMs: MINUTE, keys: 100_000 });
  const total = limiter({ max: 60, windowMs: MINUTE, keys: 1 });
  return (who: string, where: string, fetches: boolean): boolean =>
    (!fetches || (account.take(who, now()) && host.take(where, now()))) && total.take("all", now());
}

// The link cards' queue raises its own alerts, not the lines' (each name a literal: scripts/check_docs.py reads them).
const cardAlerts = (log: Log) => ({
  backlog: () => {
    log("alert", { error: "card_backlog" });
  },
  full: () => {
    log("alert", { error: "card_queue_full" });
  },
});

// Ties a line to a card and tells it, unless its card was removed.
const tiedBy =
  (store: CardStore, publish: (event: CardEvent) => void) =>
  (line: Tied, key: string): void => {
    if (store.tie(line, key)) publish({ msgid: line.msgid, room: line.room, key });
  };

// What takes a line's card away: a REDACT, an edit and a removal, each told with a null key.
const takings = ({
  store,
  waiting,
  publish,
  pepper,
}: {
  store: CardStore;
  waiting: Waiting;
  publish: (event: CardEvent) => void;
  pepper: string;
}): Pick<CardFlow, "redacted" | "edited" | "remove"> => ({
  redacted(room, msgid) {
    waiting.forget(room, msgid);
    if (store.untie(room, msgid)) publish({ msgid, room, key: null });
  },
  // `+gnoworld/edit` is the client's tag: it counts only from the line's own author, in its own room (as the pins').
  edited({ edits, msgid, room, account }) {
    if (edits === undefined) return;
    const author = accountKey(pepper, account);
    waiting.forget(room, edits, author);
    const old = store.line(edits);
    if (old?.room !== room || old.author !== author) return;
    if (store.replace(old, msgid)) publish({ msgid: old.msgid, room: old.room, key: null });
  },
  remove(room, msgid) {
    const done = store.remove(room, msgid);
    if (done) publish({ msgid, room, key: null });
    return done;
  },
});

export function makeCardFlow(options: CardFlowOptions): CardFlow {
  const {
    db,
    roles,
    pepper,
    reader,
    check,
    thresholds,
    publish,
    log,
    now,
    maxRows = MAX_ROWS,
    maxBytes = MAX_BYTES,
  } = options;
  const store = new CardStore(db, now);
  const waiting = new Waiting();
  const allowed = makeLimits(now);
  const tie = tiedBy(store, publish);
  // The lines are taken after the check, so a line taken or edited meanwhile has left them; a failure frees the page all the same.
  const settle = async (job: Job): Promise<void> => {
    try {
      if ((await examine({ store, reader, check, thresholds, log }, job)) === "passed")
        for (const line of waiting.lines(job.key)) tie(line, job.key);
    } finally {
      waiting.take(job.key);
    }
  };
  const queue = makeQueue<Job>({ run: settle, log, concurrency: 1, prefix: "card", alerts: cardAlerts(log) });
  const cardRoom = (room: string): boolean => mayRead(roles, room, undefined) && !hiddenRoom(roles, room);
  // A page not known, stale or unchecked is read (an unchecked one with its stored answer, read again no more) and checked.
  const fetch = (job: Omit<Job, "recheck">, page: Page | undefined): void => {
    const recheck = page?.state === "unchecked" && page.title !== null;
    const started = allowed(job.account, new URL(job.url).hostname, !recheck) && queue.push({ ...job, recheck });
    // Past a limit or a full queue the line has no card, and the page is asked again by the next line.
    if (!started) waiting.take(job.key);
  };
  // What a line heard asks of its page: wait on a page being read, take a fresh card, or start a read.
  const route = (mine: Tied, job: Omit<Job, "recheck">): void => {
    const page = store.page(job.key);
    if (waiting.has(job.key)) waiting.add(job.key, mine);
    else if (page === undefined || now() - page.at >= TTL[page.state]) {
      waiting.add(job.key, mine);
      fetch(job, page);
    } else if (page.state === "passed") tie(mine, job.key);
  };
  const heard = (said: Said): void => {
    // Never a guest's line, a line to operators or voices alone, or one in a room a guest may not read.
    const link =
      said.account.startsWith(GUEST_PREFIX) || said.few !== undefined || !cardRoom(said.room)
        ? undefined
        : cardLinkOf(said.text);
    if (link === undefined) return;
    const url = normalisedUrl(link);
    const key = createHash("sha256").update(url).digest("hex");
    const line = store.line(said.msgid);
    if (line?.removed === 1 || line?.key === key) return;
    route(
      { room: said.room, msgid: said.msgid, author: accountKey(pepper, said.account) },
      { account: said.account, key, url },
    );
  };

  return {
    heard,
    ...takings({ store, waiting, publish, pepper }),
    idle: queue.idle,
    stop: queue.stop,
    waiting: () => waiting.size(),
    lines: (room, ids) => store.lines(room, ids),
    content: (key) => store.content(key),
    picture: (key) => store.picture(key),
    known: (room, msgid) => store.known(room, msgid),
    isAuthor: (room, msgid, who) => store.isAuthor(room, msgid, accountKey(pepper, who)),
    expire: (limit) => expireCards(db, { now: now(), maxRows, maxBytes }, limit),
  };
}
