// A hit's snippet cut at its marks, to be drawn as text: the server's marks are UTF-16 offsets into the text.
import { marksSound } from "../../../lib/api/search.ts";

export interface Piece {
  text: string;
  marked: boolean;
  /** Where the piece starts in the text. */
  at: number;
}

/** The text as pieces, the marked ones flagged; marks that do not sit in the text mark nothing. */
export function pieces(text: string, marks: readonly (readonly [number, number])[]): Piece[] {
  if (!marksSound(text, marks)) return [{ text, marked: false, at: 0 }];
  const out: Piece[] = [];
  let at = 0;
  for (const [from, to] of marks) {
    if (from > at) out.push({ text: text.slice(at, from), marked: false, at });
    out.push({ text: text.slice(from, to), marked: true, at: from });
    at = to;
  }
  if (at < text.length || out.length === 0) out.push({ text: text.slice(at), marked: false, at });
  return out;
}
