// A line as moderation compares it (slice 3's rules, then 4d's mentions): compatibility forms to their plain
// letters, accents and invisible format characters dropped, lower case. One fold for the server's count and the
// page's mentions, so the page shows no mention the count misses (F807, F809).

/** Text folded: NFKD, marks and format characters dropped, lower case. */
export const fold = (text: string): string =>
  text
    .normalize("NFKD")
    .replace(/[\p{M}\p{Cf}]/gu, "")
    .toLowerCase();
