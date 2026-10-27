// A room's lines as shown (slice 4's 4d, F664): an edit is a line of its own that names the line it corrects
// (+gnoworld/edit, docs/decisions.md 2026-10-21); the room shows the correction in that line's place, marked edited,
// when the same account wrote both, the line before the edit, in this room, and the line no edit itself. Any other edit
// stays a line of its own, as a plain IRC client shows it.
import type { Line } from "./room.ts";

/** A line as shown: corrected by an edit, said so. */
export type ShownLine = Line & { readonly edited?: true };

// Each corrected line's newest edit, by the line's msgid; each folded edit's line, by the edit's msgid.
function folding(lines: readonly Line[]) {
  const places = new Map(lines.map((line, at) => [line.id, at]));
  const newest = new Map<string, Line>();
  const folded = new Map<string, string>();
  for (const [at, edit] of lines.entries()) {
    const target = places.get(edit.edits ?? "");
    const line = target === undefined || target >= at ? undefined : lines[target];
    if (line === undefined || line.edits !== undefined || edit.account === undefined || edit.account !== line.account)
      continue;
    newest.set(line.id, edit);
    folded.set(edit.id, line.id);
  }
  return { newest, folded };
}

interface Folded {
  readonly shown: readonly ShownLine[];
  readonly folded: ReadonlyMap<string, string>;
  /** The msgid of the newest edit shown in each corrected line's place, by the line's msgid: what is checked of a line (the
   * moderation's verdict) is checked by msgid, and the words shown are the edit's. */
  readonly newest: ReadonlyMap<string, string>;
}

/** The room's lines, in their order, each corrected by its newest edit and the edits gone (the same array when no
 * line is corrected), and the line each folded edit corrects by the edit's own msgid, which a plain client answers or
 * reacts to (the code review's CR5): one fold for both. */
export function foldEdits(lines: readonly Line[]): Folded {
  const { newest, folded } = folding(lines);
  const edited = new Map([...newest].map(([id, edit]) => [id, edit.id]));
  const shown =
    folded.size === 0
      ? lines
      : lines.flatMap((line): ShownLine[] => {
          const edit = newest.get(line.id);
          if (edit !== undefined) return [{ ...line, text: edit.text, kind: edit.kind, edited: true }];
          return folded.has(line.id) ? [] : [line];
        });
  return { shown, folded, newest: edited };
}

/** The room's lines as shown: see foldEdits. */
export const shownLines = (lines: readonly Line[]): readonly ShownLine[] => foldEdits(lines).shown;

/** The line each folded edit corrects, by the edit's own msgid: see foldEdits. */
export const editsFolded = (lines: readonly Line[]): ReadonlyMap<string, string> => foldEdits(lines).folded;
