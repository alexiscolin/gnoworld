// A line as moderation compares it (slice 3's rules, then 4d's mentions): compatibility forms to their plain
// letters, accents and invisible format characters dropped, lower case. One fold for the server's count and the
// page's mentions, so the page shows no mention the count misses (F807, F809).

/** Text folded: NFKD, marks and format characters dropped, lower case. */
export const fold = (text: string): string =>
  text
    .normalize("NFKD")
    .replace(/[\p{M}\p{Cf}]/gu, "")
    .toLowerCase();

/** Every mention of a text, a repeat each time, as moderation counts them: on the folded text, an `@` after no letter, digit or
 * `_`, then letters, digits and `_`, each with its at sign. Any letter, so a lookalike name is one too. */
export const mentionList = (text: string): string[] => fold(text).match(/(?<![\p{L}\p{N}_])@[\p{L}\p{N}_]+/gu) ?? [];

/** The names a text mentions, each once (a translation adds none: jarvis's check). */
export const mentionsOf = (text: string): Set<string> => new Set(mentionList(text));
