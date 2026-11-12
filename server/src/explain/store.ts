// The explanations' table, one row per subject (a realm or a world, on a chain) and prompt version: its state (ready, making, refused, failed),
// its text and tags, the model that made it (`seed` for a row a seed file wrote), the time it was made, the tries and the next try's time.
// Never evicted: a refused row is the memory that nothing is asked again for that version; the only row that goes is an older version's, once
// the newer one is ready. Every statement reads by the primary key or the `started` index.
import { REALM_EXPLAIN_VERSION, REALM_TAGS, type ExplainKind, type RealmTag } from "@gnoworld/schemas";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";

export const EXPLAIN_TABLES = `
CREATE TABLE explanations (kind TEXT NOT NULL CHECK (kind IN ('realm', 'world')), chain TEXT NOT NULL, subject TEXT NOT NULL, version INTEGER NOT NULL, state TEXT NOT NULL CHECK (state IN ('ready', 'making', 'refused', 'failed')), text TEXT, tags TEXT NOT NULL, model TEXT, made_at INTEGER, tries INTEGER NOT NULL, started INTEGER NOT NULL, next_try INTEGER NOT NULL, PRIMARY KEY (kind, chain, subject, version)) STRICT, WITHOUT ROWID;
CREATE INDEX explanations_by_started ON explanations (started);
`;

/** What an explanation is of: a realm, or a world (by its main realm's path until a composed line is decided), on a chain. */
export interface Key {
  kind: ExplainKind;
  chain: string;
  subject: string;
}

export interface Row {
  state: "ready" | "making" | "refused" | "failed";
  text: string | null;
  tags: RealmTag[];
  model: string | null;
  tries: number;
  nextTry: number;
}

export interface Explanations {
  /** The row of the key for the current prompt version. */
  get: (key: Key) => Row | undefined;
  /** Whether this call took the subject to make: none for a ready, a refused, a making not yet stale or a failed not yet due; `until` is when a making is stale. */
  claim: (key: Key, when: { now: number; until: number }) => boolean;
  /** The line made, its older versions dropped. */
  keep: (key: Key, made: { text: string; tags: readonly RealmTag[]; model: string; now: number }) => void;
  /** The line refused: never asked again for this version. */
  refuse: (key: Key) => void;
  /** The making failed: asked again once `retryAt` has come. */
  failedAt: (key: Key, retryAt: number) => void;
  /** A seed's row, ready, or refused when it holds no line; false when a ready row of the same version, made by Jarvis, is there. */
  seed: (key: Key, line: { text: string; tags: readonly RealmTag[]; now: number } | undefined) => boolean;
  /** The makings started at or after a time. */
  startedSince: (since: number) => number;
}

const Tags = z.array(z.enum(REALM_TAGS));
const Count = z.object({ n: z.number() });
const Stored = z.object({
  state: z.enum(["ready", "making", "refused", "failed"]),
  text: z.nullable(z.string()),
  tags: z.string(),
  model: z.nullable(z.string()),
  tries: z.number(),
  next_try: z.number(),
});

export function makeExplanations(db: DatabaseSync): Explanations {
  const V = REALM_EXPLAIN_VERSION;
  const sql = {
    get: db.prepare(
      "SELECT state, text, tags, model, tries, next_try FROM explanations WHERE kind = ? AND chain = ? AND subject = ? AND version = ?",
    ),
    claim: db.prepare(
      `INSERT INTO explanations (kind, chain, subject, version, state, tags, tries, started, next_try) VALUES (?, ?, ?, ?, 'making', '[]', 1, ?, ?)
       ON CONFLICT (kind, chain, subject, version) DO UPDATE SET state = 'making', tries = tries + 1, started = excluded.started, next_try = excluded.next_try
       WHERE state IN ('making', 'failed') AND next_try <= excluded.started`,
    ),
    keep: db.prepare(
      `INSERT INTO explanations (kind, chain, subject, version, state, text, tags, model, made_at, tries, started, next_try)
       VALUES (?, ?, ?, ?, 'ready', ?, ?, ?, ?, 0, ?, 0)
       ON CONFLICT (kind, chain, subject, version) DO UPDATE SET state = 'ready', text = excluded.text, tags = excluded.tags, model = excluded.model, made_at = excluded.made_at, next_try = 0`,
    ),
    older: db.prepare("DELETE FROM explanations WHERE kind = ? AND chain = ? AND subject = ? AND version < ?"),
    refuse: db.prepare(
      "UPDATE explanations SET state = 'refused', text = NULL, tags = '[]', next_try = 0 WHERE kind = ? AND chain = ? AND subject = ? AND version = ?",
    ),
    failedAt: db.prepare(
      "UPDATE explanations SET state = 'failed', next_try = ? WHERE kind = ? AND chain = ? AND subject = ? AND version = ?",
    ),
    seed: db.prepare(
      `INSERT INTO explanations (kind, chain, subject, version, state, text, tags, model, made_at, tries, started, next_try)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'seed', ?, 0, 0, 0)
       ON CONFLICT (kind, chain, subject, version) DO UPDATE SET state = excluded.state, text = excluded.text, tags = excluded.tags, model = 'seed', made_at = excluded.made_at, next_try = 0
       WHERE state != 'ready' OR model = 'seed'`,
    ),
    since: db.prepare("SELECT count(*) AS n FROM explanations WHERE started >= ?"),
  };
  const at = ({ kind, chain, subject }: Key) => [kind, chain, subject] as const;
  const drop = (key: Key): void => {
    sql.older.run(...at(key), V);
  };
  return {
    get(key) {
      const found = sql.get.get(...at(key), V);
      if (found === undefined) return undefined;
      const row = Stored.parse(found);
      const tags = Tags.safeParse(JSON.parse(row.tags));
      return {
        state: row.state,
        text: row.text,
        tags: tags.success ? tags.data : [],
        model: row.model,
        tries: row.tries,
        nextTry: row.next_try,
      };
    },
    claim: (key, { now, until }) => Number(sql.claim.run(...at(key), V, now, until).changes) > 0,
    keep(key, { text, tags, model, now }) {
      sql.keep.run(...at(key), V, text, JSON.stringify(tags), model, now, now);
      drop(key);
    },
    refuse(key) {
      sql.refuse.run(...at(key), V);
    },
    failedAt(key, retryAt) {
      sql.failedAt.run(retryAt, ...at(key), V);
    },
    seed(key, line) {
      const row =
        line === undefined
          ? (["refused", null, "[]"] as const)
          : (["ready", line.text, JSON.stringify(line.tags)] as const);
      const now = line?.now ?? 0;
      const written = Number(sql.seed.run(...at(key), V, ...row, now).changes) > 0;
      if (written && line !== undefined) drop(key);
      return written;
    },
    startedSince: (since) => Count.parse(sql.since.get(since)).n,
  };
}
