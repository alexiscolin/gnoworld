// The bot's part of an edit (decision 156; slice 3's plan, 3k): a correction is a new line tagged with the
// id it replaces, checked as any line, and valid only from the account that wrote the line it replaces.
// The verdicts already key every line checked to its account, so no history is asked of Ergo.
import type { DatabaseSync } from "node:sqlite";

/** Whether the line `msgid` has a verdict at all: an edit of a line never checked cannot be placed (F549). */
export function lineKnown(db: DatabaseSync): (msgid: string) => boolean {
  const row = db.prepare("SELECT 1 FROM verdicts WHERE msgid = ?");
  return (msgid) => row.get(msgid) !== undefined;
}

/** Whether the line `msgid` was written by the account of this key; a line never checked is no one's. */
export function editsOwn(db: DatabaseSync): (msgid: string, key: string) => boolean {
  const owner = db.prepare("SELECT 1 FROM verdicts WHERE msgid = ? AND account = ?");
  return (msgid, key) => owner.get(msgid, key) !== undefined;
}
