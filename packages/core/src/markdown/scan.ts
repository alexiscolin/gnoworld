// What the line reader looks at around a place (slice 4's 4c): runs of one character, the characters on either
// side of a run, whole, and the line's runs of backticks.

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
  readonly #starts = new Map<number, number[]>();
  readonly #next = new Map<number, number>();

  constructor(source: string) {
    let at = source.indexOf("`");
    while (at !== -1) {
      const size = runOf(source, at, "`");
      const starts = this.#starts.get(size) ?? [];
      starts.push(at);
      this.#starts.set(size, starts);
      at = source.indexOf("`", at + size);
    }
  }

  /** Where the first run of `size` starting at `from` or later starts; asked with `from` never going back. */
  after(size: number, from: number): number | undefined {
    const starts = this.#starts.get(size) ?? [];
    let next = this.#next.get(size) ?? 0;
    while (next < starts.length && (starts[next] ?? from) < from) next += 1;
    this.#next.set(size, next);
    return starts[next];
  }
}
