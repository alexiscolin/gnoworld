// The one rule for text a reader must see as it is: control and format characters (Cc, Cf: bidi marks, zero-width, joiners,
// tags, escapes), the line and paragraph separators and the Hangul fillers, which draw as nothing. A call's argument, a link
// card's text and a data file's label are held to it.

/** The class of a hidden character, for a pattern that keeps some or writes each one out. */
export const HIDDEN_CLASS = "\\p{Cc}\\p{Cf}\\u2028\\u2029\\u115f\\u1160\\u3164\\uffa0";

/** Whether `text` holds a hidden character other than those in `keep`. */
export function hasHidden(text: string, keep = ""): boolean {
  const hidden = new RegExp(`[${HIDDEN_CLASS}]`, "u");
  for (const char of text) if (hidden.test(char) && !keep.includes(char)) return true;
  return false;
}

/** `text` without its hidden characters, except those in `keep`. */
export function stripHidden(text: string, keep = ""): string {
  const hidden = new RegExp(`[${HIDDEN_CLASS}]`, "u");
  let kept = "";
  for (const char of text) if (!hidden.test(char) || keep.includes(char)) kept += char;
  return kept;
}
