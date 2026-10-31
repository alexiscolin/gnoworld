// A line's addresses (slice 4's 4c): where an https address starting at a place ends, as a link's or a bare one.
// Nothing else is an address: a host of ASCII letters, digits, dots and hyphens (no look-alike letter), no user
// before an `@`, and no space, quote, angle, backslash, backtick, control or format character anywhere. Each
// answer costs the address's host, the rest read once a line, so a line of addresses reads in linear time.
import { before } from "./scan.ts";

// A bare address's closing punctuation, left out of it; a `)` too when the address does not open it.
const TRAIL = /[.,:;!?*_~']/;
// What may come before a bare address: a line's start, a space, a mark's opening or a `(` (GFM's rule).
const WORD_START = /[\s*_~(]/u;
// What ends a bare address; any other character no address may hold makes it none.
const ENDS = /[\s<]/u;
// What opens an address's path, after its host.
const PATH = /[/?#]/;

/** Where `https://host[:port]` starting at `at` ends, or -1; a port from 1 to 65535, or none a browser opens (F785). */
function authority(source: string, at: number): number {
  if (!source.startsWith("https://", at)) return -1;
  const host = /[A-Za-z0-9][A-Za-z0-9.-]*(?::(\d{1,5})(?!\d))?/y;
  host.lastIndex = at + "https://".length;
  const found = host.exec(source);
  const port = Number(found?.[1] ?? "1");
  return found !== null && port >= 1 && port <= 65535 ? host.lastIndex : -1;
}

// For each place of the line, the first one from it no address may hold (a space and `<` among them; an emoji is
// not one).
function stops(source: string): Int32Array {
  const stop = new Int32Array(source.length + 1).fill(source.length);
  let from = 0;
  for (const found of source.matchAll(/[\s<>\\"`\p{C}]/gu)) {
    stop.fill(found.index, from, found.index + 1);
    from = found.index + 1;
  }
  return stop;
}

// For each `(` of the line, the `)` that closes it, or -1 (an address between them holds no space: #stop says so).
function parens(source: string): Int32Array {
  const match = new Int32Array(source.length).fill(-1);
  const open: number[] = [];
  for (let at = 0; at < source.length; at += 1) {
    const char = source[at];
    if (char === "(") open.push(at);
    const opened = char === ")" ? open.pop() : undefined;
    if (opened !== undefined) match[opened] = at;
  }
  return match;
}

const count = (source: string, char: string): number => source.split(char).length - 1;

/** An https origin as a page's links may resolve against: `https://host[:port]` and at most a closing `/`, nothing else
 * (no user, path, query or look-alike letter); the origin without the `/`, or none. */
export function originOf(origin: string): string | undefined {
  const end = authority(origin, 0);
  const bare = origin.endsWith("/") ? origin.slice(0, -1) : origin;
  return end === bare.length ? bare : undefined;
}

/** A line's addresses, its tables made once and only when an address is asked. With an origin (originOf's), a link to a
 * path of that origin is one too. */
export class Addresses {
  readonly #source: string;
  readonly #origin: string | undefined;
  #stops: Int32Array | undefined;
  #parens: Int32Array | undefined;

  constructor(source: string, origin?: string) {
    this.#source = source;
    this.#origin = origin;
  }

  /** The `)` that ends a link's address opening at `at` with `(`, the address a plain https one; or -1 (any place but
   * a `(` has none). */
  destination(at: number): number {
    this.#parens ??= parens(this.#source);
    const end = this.#parens[at] ?? -1;
    const path = authority(this.#source, at + 1);
    if (path === end || (PATH.test(this.#source.charAt(path)) && this.#stop(path) >= end)) return end;
    return this.#local(at + 1) && this.#stop(at + 1) >= end ? end : -1;
  }

  /** The address of a link whose `(` is at `at` and `)` at `end`, as `destination` accepted it: the path, under the origin. */
  href(at: number, end: number): string {
    const address = this.#source.slice(at + 1, end);
    return this.#origin !== undefined && address.startsWith("/") ? this.#origin + address : address;
  }

  // Whether a path of the origin starts at `at`: one slash, then neither a second (a host of its own) nor a backslash
  // (which a browser reads as one).
  #local(at: number): boolean {
    return this.#origin !== undefined && this.#source.charAt(at) === "/" && !/[/\\]/.test(this.#source.charAt(at + 1));
  }

  /**
   * Where a bare address at `at` ends: a word's start, its host, then a path to a space, `<` or the line's end,
   * less its closing punctuation and a `)` it does not open; -1 if it is none.
   */
  bare(at: number): number {
    const previous = before(this.#source, at);
    if (previous !== undefined && !WORD_START.test(previous)) return -1;
    const path = authority(this.#source, at);
    if (path === -1) return -1;
    const stop = this.#stop(path);
    if (stop < this.#source.length && !ENDS.test(this.#source.charAt(stop))) return -1;
    if (!PATH.test(this.#source.charAt(path)) && !trailing(this.#source, path, stop)) return -1;
    return this.#trimmed(at, stop);
  }

  #stop(at: number): number {
    this.#stops ??= stops(this.#source);
    return this.#stops[at] ?? this.#source.length;
  }

  // The address less its closing punctuation, and less each `)` it has not opened.
  #trimmed(at: number, stop: number): number {
    const address = this.#source.slice(at, stop);
    let unopened = count(address, ")") - count(address, "(");
    let end = stop;
    // The host's first character, a letter or a digit, ends the trimming at the latest.
    while (end > at) {
      const last = this.#source.charAt(end - 1);
      if (last === ")" ? unopened <= 0 : !TRAIL.test(last)) break;
      if (last === ")") unopened -= 1;
      end -= 1;
    }
    return end;
  }
}

// Whether the line from `from` to `to` is closing punctuation alone, a `)` among it.
function trailing(source: string, from: number, to: number): boolean {
  for (let at = from; at < to; at += 1) {
    const char = source.charAt(at);
    if (char !== ")" && !TRAIL.test(char)) return false;
  }
  return true;
}
