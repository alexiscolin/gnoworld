// The one rule for text a reader must see as it is: control and format characters (Cc, Cf: bidi marks, zero-width, joiners, tags,
// escapes), the line and paragraph separators and the Hangul fillers (which draw as nothing), shared by the call card's arguments (call.ts) and the link card's text (cards.ts). core keeps its own copies
// (architecture: core imports nothing).
const HIDDEN = /[\p{Cc}\p{Cf}\u2028\u2029\u115f\u1160\u3164\uffa0]/u;

/** Whether `text` holds a Cc or Cf character other than those in `keep`. */
export function hasHidden(text: string, keep = ""): boolean {
  for (const char of text) if (HIDDEN.test(char) && !keep.includes(char)) return true;
  return false;
}

/** `text` without its Cc and Cf characters, except those in `keep`. */
export function stripHidden(text: string, keep = ""): string {
  let kept = "";
  for (const char of text) if (!HIDDEN.test(char) || keep.includes(char)) kept += char;
  return kept;
}
