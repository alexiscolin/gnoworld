// A count in words, as the page's English says it: the word as it is for one, with an "s" for any other count.

/** `count` and `word`, "1 line", "2 lines", "0 lines". */
export const plural = (count: number, word: string): string => `${String(count)} ${word}${count === 1 ? "" : "s"}`;
