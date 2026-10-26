// A room's lines as shown (slice 4's 4d, F664): an edit is a line of its own that names the line it corrects
// (+gnoworld/edit, docs/decisions.md 2026-10-21); the room shows the correction in that line's place, marked edited,
// when the same account wrote both, the line before the edit, in this room, and the line no edit itself. Any other edit
// stays a line of its own, as a plain IRC client shows it.
import type { Line } from "./room.ts";

/** A line as shown: corrected by an edit, said so. */
export type ShownLine = Line & { readonly edited?: true };

/** The room's lines, in their order, each corrected by its newest edit and the edits gone; the same array when no line
 * is corrected. */
export function shownLines(lines: readonly Line[]): readonly ShownLine[] {
  const places = new Map(lines.map((line, at) => [line.id, at]));
  const newest = new Map<string, Line>();
  const folded = new Set<string>();
  for (const [at, edit] of lines.entries()) {
    const target = places.get(edit.edits ?? "");
    const line = target === undefined || target >= at ? undefined : lines[target];
    if (line === undefined || line.edits !== undefined || edit.account === undefined || edit.account !== line.account)
      continue;
    newest.set(line.id, edit);
    folded.add(edit.id);
  }
  if (folded.size === 0) return lines;
  return lines.flatMap((line): ShownLine[] => {
    const edit = newest.get(line.id);
    if (edit !== undefined) return [{ ...line, text: edit.text, kind: edit.kind, edited: true }];
    return folded.has(line.id) ? [] : [line];
  });
}
