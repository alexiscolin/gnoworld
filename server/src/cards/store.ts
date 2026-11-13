// The link cards' tables and their rows (slice 13, L3; D13906): one row a page (`link_cards`: its state, texts and re-encoded picture) and one a
// line (`line_cards`: its key and its author's HMAC, never its text). A line's removal is a flag that outlives its edits; an empty `key` means no card now.
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type { LinkCard, ReaderCard } from "@gnoworld/schemas";
import { z } from "zod";
import type { Tied } from "./waiting.ts";

export const CARD_TABLES = `
CREATE TABLE link_cards (
  key TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  at INTEGER NOT NULL,
  host TEXT,
  site TEXT,
  title TEXT,
  description TEXT,
  width INTEGER,
  height INTEGER,
  picture BLOB,
  bytes INTEGER NOT NULL DEFAULT 0
) STRICT;
CREATE INDEX link_cards_by_at ON link_cards (at);
CREATE TABLE line_cards (
  msgid TEXT PRIMARY KEY,
  room TEXT NOT NULL,
  key TEXT NOT NULL,
  author TEXT NOT NULL,
  at INTEGER NOT NULL,
  removed INTEGER NOT NULL DEFAULT 0
) STRICT;
CREATE INDEX line_cards_by_key ON line_cards (key);
CREATE INDEX line_cards_by_at ON line_cards (at);
`;

export type State = "passed" | "failed" | "down" | "unchecked";

const Page = z.object({
  state: z.enum(["passed", "failed", "down", "unchecked"]),
  at: z.number(),
  host: z.string().nullable(),
  site: z.string().nullable(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  picture: z.instanceof(Uint8Array).nullable(),
});
export type Page = z.infer<typeof Page>;
const Line = z.object({
  msgid: z.string(),
  room: z.string(),
  key: z.string(),
  author: z.string(),
  removed: z.number(),
});
export type Line = z.infer<typeof Line>;

const PAGE = "state, at, host, site, title, description, width, height, picture";
// A page's live card: passed, and some line of it not removed.
const LIVE = "state = 'passed' AND EXISTS (SELECT 1 FROM line_cards l WHERE l.key = link_cards.key AND l.removed = 0)";
const NOTHING = { site: null, title: null, description: null, width: null, height: null, picture: null, bytes: 0 };

function rowOf(card: ReaderCard | undefined) {
  if (card === undefined) return NOTHING;
  const { picture, ...texts } = card;
  const jpeg = picture === null ? null : Buffer.from(picture.jpeg, "base64");
  return {
    ...texts,
    width: picture?.width ?? null,
    height: picture?.height ?? null,
    picture: jpeg,
    bytes: jpeg?.length ?? 0,
  };
}

export class CardStore {
  readonly #db: DatabaseSync;
  readonly #now: () => number;

  constructor(db: DatabaseSync, now: () => number) {
    this.#db = db;
    this.#now = now;
  }

  #one(sql: string, ...values: SQLInputValue[]) {
    return this.#db.prepare(sql).get(...values);
  }

  #run(sql: string, ...values: SQLInputValue[]): boolean {
    return Number(this.#db.prepare(sql).run(...values).changes) > 0;
  }

  page(key: string): Page | undefined {
    const row = this.#one(`SELECT ${PAGE} FROM link_cards WHERE key = ?`, key);
    return row === undefined ? undefined : Page.parse(row);
  }

  put(key: string, how: { state: State; host: string }, card?: ReaderCard): void {
    const row = rowOf(card);
    this.#run(
      `INSERT INTO link_cards (key, state, at, host, site, title, description, width, height, picture, bytes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET state = excluded.state, at = excluded.at, host = excluded.host, site = excluded.site, title = excluded.title,
       description = excluded.description, width = excluded.width, height = excluded.height, picture = excluded.picture, bytes = excluded.bytes`,
      ...[
        key,
        how.state,
        this.#now(),
        how.host,
        row.site,
        row.title,
        row.description,
        row.width,
        row.height,
        row.picture,
        row.bytes,
      ],
    );
  }

  line(msgid: string): Line | undefined {
    const row = this.#one("SELECT msgid, room, key, author, removed FROM line_cards WHERE msgid = ?", msgid);
    return row === undefined ? undefined : Line.parse(row);
  }

  /** Ties a line to a card, unless its card was removed; whether it changed. */
  tie({ room, msgid, author }: Tied, key: string): boolean {
    return this.#run(
      "INSERT INTO line_cards (msgid, room, key, author, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (msgid) DO UPDATE SET key = excluded.key, at = excluded.at WHERE removed = 0",
      msgid,
      room,
      key,
      author,
      this.#now(),
    );
  }

  /** Takes a line's card away (a REDACT); whether it had one. */
  untie(room: string, msgid: string): boolean {
    return this.#run("UPDATE line_cards SET key = '' WHERE msgid = ? AND room = ? AND key <> ''", msgid, room);
  }

  /** An edit replaces `old`: its card goes, and its removal passes to the edit. Whether the line had a card. */
  replace(old: Line, msgid: string): boolean {
    const had = this.untie(old.room, old.msgid);
    if (old.removed === 1)
      this.#run(
        "INSERT OR IGNORE INTO line_cards (msgid, room, key, author, at, removed) VALUES (?, ?, '', ?, ?, 1)",
        msgid,
        old.room,
        old.author,
        this.#now(),
      );
    return had;
  }

  remove(room: string, msgid: string): boolean {
    return this.#run(
      "UPDATE line_cards SET removed = 1 WHERE msgid = ? AND room = ? AND removed = 0 AND key <> ''",
      msgid,
      room,
    );
  }

  lines(room: string, ids: readonly string[]): { msgid: string; key: string }[] {
    if (ids.length === 0) return [];
    const where = `room = ? AND removed = 0 AND key IN (SELECT key FROM link_cards WHERE state = 'passed') AND msgid IN (${ids.map(() => "?").join(",")})`;
    const rows = z
      .array(Line.pick({ msgid: true, key: true }))
      .parse(this.#db.prepare(`SELECT msgid, key FROM line_cards WHERE ${where}`).all(room, ...ids));
    const held = new Map(rows.map(({ msgid, key }) => [msgid, key]));
    return ids.flatMap((msgid) => (held.has(msgid) ? [{ msgid, key: held.get(msgid) ?? "" }] : []));
  }

  #live(key: string): Page | undefined {
    const row = this.#one(`SELECT ${PAGE} FROM link_cards WHERE key = ? AND ${LIVE}`, key);
    return row === undefined ? undefined : Page.parse(row);
  }

  content(key: string): LinkCard | undefined {
    const page = this.#live(key);
    if (page === undefined) return undefined;
    const { host, site, title, description, width, height } = page;
    return {
      host: host ?? "",
      site: site ?? "",
      title: title ?? "",
      description: description ?? "",
      picture: width === null || height === null ? null : { width, height },
    };
  }

  picture(key: string): Uint8Array | undefined {
    return this.#live(key)?.picture ?? undefined;
  }

  known(room: string, msgid: string): boolean {
    return (
      this.#one(
        "SELECT 1 AS n FROM line_cards WHERE msgid = ? AND room = ? AND key <> '' AND removed = 0",
        msgid,
        room,
      ) !== undefined
    );
  }

  isAuthor(room: string, msgid: string, author: string): boolean {
    return (
      this.#one("SELECT 1 AS n FROM line_cards WHERE msgid = ? AND room = ? AND author = ?", msgid, room, author) !==
      undefined
    );
  }
}
