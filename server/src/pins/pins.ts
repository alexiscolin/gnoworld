// A room's pins (slice 4's 4d; docs/decisions.md, 2026-10-27): the line as Ergo held it when a moderator pinned it,
// kept in the server's database, since Ergo keeps a channel's metadata for registered channels alone and ours are not.
// A pin is read from Ergo by its id, never taken from the page; it ends with its line: a delete, a hide or an edit by
// the author drops it, and a re-read of each pin (check) drops those Ergo no longer holds.
import type { DatabaseSync } from "node:sqlite";
import { PinnedLine } from "@gnoworld/schemas";
import { z } from "zod";
import type { Fetched } from "../irc/link.ts";

export const PIN_TABLES = `
CREATE TABLE pins (
  room TEXT NOT NULL,
  msgid TEXT NOT NULL,
  time TEXT NOT NULL,
  account TEXT NOT NULL,
  text TEXT NOT NULL,
  pinned_by TEXT NOT NULL,
  pinned_at INTEGER NOT NULL,
  PRIMARY KEY (room, msgid)
) STRICT;
`;

/** What adding a pin came to: pinned, held already, no such line (or Ergo says it is gone), the room's cap reached,
 * a line that is no plain message, or Ergo did not answer. */
type Added = "pinned" | "already" | "not_found" | "full" | "refused" | "unavailable";

export interface Pins {
  /** A room's pins, the newest pinned first. */
  list: (room: string) => PinnedLine[];
  /** Pins a line of a room, as Ergo holds it, for the account `by`. */
  add: (room: string, msgid: string, by: string) => Promise<Added>;
  /** Unpins; whether the line was pinned. */
  remove: (room: string, msgid: string) => boolean;
  /** The line left its room (a REDACT): its pin goes, a pin being added for it never lands. */
  drop: (room: string, msgid: string) => void;
  /** The line `msgid` was replaced by an edit of `by`: its pin goes if `by` wrote it. */
  edited: (room: string, msgid: string, by: string) => void;
  /** Asks Ergo for each pin of a room again and drops those it no longer holds: a delete while the link was down is
   * only seen so, once the link is in the room. */
  check: (room: string) => Promise<void>;
}

interface Options {
  db: DatabaseSync;
  // The line of a room by its id, as Ergo holds it (the link's line).
  fetch: (room: string, msgid: string) => Promise<Fetched>;
  now: () => number;
  // A room's pins at most.
  max: number;
}

const Count = z.object({ n: z.number() });
const Ids = z.array(z.object({ msgid: z.string() }));

// A line Ergo gave as a pin, or why it is none: the link's answer is checked, not trusted: that line of that room, a
// plain message (no CTCP, an /me among them) of an account, with its time.
function pinFrom(room: string, msgid: string, got: Fetched): PinnedLine | "not_found" | "refused" | "unavailable" {
  if (got === "unanswered") return "unavailable";
  if (got === "gone" || got.room !== room || got.msgid !== msgid) return "not_found";
  const pin = PinnedLine.safeParse({ id: got.msgid, time: got.time, account: got.account, text: got.text });
  return pin.success && !got.text.startsWith("\u0001") ? pin.data : "refused";
}

export function makePins({ db, fetch, now, max }: Options): Pins {
  // The pins being added, by line: a REDACT heard while Ergo is asked marks them, so the line is not pinned after it.
  const adding = new Map<string, Set<{ gone: boolean }>>();
  const held = (room: string, msgid: string): boolean =>
    db.prepare("SELECT 1 FROM pins WHERE room = ? AND msgid = ?").get(room, msgid) !== undefined;
  const drop = (room: string, msgid: string): number =>
    Number(db.prepare("DELETE FROM pins WHERE room = ? AND msgid = ?").run(room, msgid).changes);
  // Ergo's word on a line, "gone" if the line was dropped meanwhile.
  const ask = async (room: string, msgid: string): Promise<Fetched> => {
    const key = `${room} ${msgid}`;
    const watch = { gone: false };
    adding.set(key, (adding.get(key) ?? new Set()).add(watch));
    try {
      const got = await fetch(room, msgid);
      return watch.gone ? "gone" : got;
    } finally {
      const rest = adding.get(key);
      rest?.delete(watch);
      if (rest?.size === 0) adding.delete(key);
    }
  };
  return {
    list: (room) =>
      z
        .array(PinnedLine)
        .parse(
          db
            .prepare(
              "SELECT msgid AS id, time, account, text FROM pins WHERE room = ? ORDER BY pinned_at DESC, rowid DESC",
            )
            .all(room),
        ),
    async add(room, msgid, by) {
      if (held(room, msgid)) return "already";
      const pin = pinFrom(room, msgid, await ask(room, msgid));
      if (typeof pin === "string") return pin;
      // After the wait, in one turn with the insert: another request may have pinned the line or filled the room.
      if (held(room, msgid)) return "already";
      const { n } = Count.parse(db.prepare("SELECT count(*) AS n FROM pins WHERE room = ?").get(room));
      if (n >= max) return "full";
      db.prepare(
        "INSERT INTO pins (room, msgid, time, account, text, pinned_by, pinned_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run(room, msgid, pin.time, pin.account, pin.text, by, now());
      return "pinned";
    },
    remove: (room, msgid) => drop(room, msgid) > 0,
    drop(room, msgid) {
      drop(room, msgid);
      for (const watch of adding.get(`${room} ${msgid}`) ?? []) watch.gone = true;
    },
    edited(room, msgid, by) {
      db.prepare("DELETE FROM pins WHERE room = ? AND msgid = ? AND account = ?").run(room, msgid, by);
    },
    async check(room) {
      const all = Ids.parse(db.prepare("SELECT msgid FROM pins WHERE room = ? ORDER BY rowid").all(room));
      // ponytail: a room's pins one after another, ten at most; a link slower than that wants them side by side.
      for (const { msgid } of all) if ((await fetch(room, msgid)) === "gone") drop(room, msgid);
    },
  };
}
