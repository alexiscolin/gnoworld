// What the line reader looks at around a place (slice 4's 4c): runs of one character, the characters on either
// side of a run, whole, the word bounds a mark's run opens and closes at, and the line's runs of backticks.

const SPACE = /\s/u;
const PUNCTUATION = /[\p{P}\p{S}]/u;

// A mark opens before a word (no space after it; a space, punctuation or the line's start before it) and closes
// after one, the other way round: none inside a word, as snake_case and 2*3*4 write.
const bound = (char: string | undefined) => char === undefined || SPACE.test(char) || PUNCTUATION.test(char);
/** Whether a character is part of a word, as the reader bounds marks: no space, punctuation or symbol. */
export const inWord = (char: string | undefined): boolean => !bound(char);
/** Whether a mark's run between `behind` and `ahead` may open one: before a word, after its bound. */
export const opens = (behind: string | undefined, ahead: string | undefined): boolean =>
  ahead !== undefined && !SPACE.test(ahead) && bound(behind);
/** Whether a mark's run between `behind` and `ahead` may close one: after a word, before its bound. */
export const closes = (behind: string | undefined, ahead: string | undefined): boolean =>
  behind !== undefined && !SPACE.test(behind) && bound(ahead);

/** How many `char` follow one another from `at`. */
export function runOf(source: string, at: number, char: string): number {
  let end = at;
  while (source[end] === char) end += 1;
  return end - at;
}

/** The character just before `at`, whole: an emoji's two halves read as one. */
export function before(source: string, at: number): string | undefined {
  const low = source.charCodeAt(at - 1);
  return at >= 2 && low >= 0xdc00 && low < 0xe000 ? source.slice(at - 2, at) : source[at - 1];
}

/** The character at `at`, whole. */
export function after(source: string, at: number): string | undefined {
  const point = source.codePointAt(at);
  return point === undefined ? undefined : String.fromCodePoint(point);
}

/**
 * A line's runs of backticks, by length, in order: a code span closes on the next run of its own length, found by
 * a pointer a length that only moves forward, so a line of runs reads in linear time.
 */
export class Runs {
  // For each length, its runs' starts in order, and the first one a code span may still close on.
  readonly #runs = new Map<number, { starts: number[]; next: number }>();

  constructor(source: string) {
    let at = source.indexOf("`");
    while (at !== -1) {
      const size = runOf(source, at, "`");
      const runs = this.#runs.get(size) ?? { starts: [], next: 0 };
      runs.starts.push(at);
      this.#runs.set(size, runs);
      at = source.indexOf("`", at + size);
    }
  }

  /** Where the first run of `size` starting at `from` or later starts; asked with `from` never going back. */
  after(size: number, from: number): number | undefined {
    const runs = this.#runs.get(size);
    if (runs === undefined) return undefined;
    while ((runs.starts[runs.next] ?? Infinity) < from) runs.next += 1;
    return runs.starts[runs.next];
  }
}
