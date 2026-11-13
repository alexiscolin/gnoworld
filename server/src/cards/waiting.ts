// The lines waiting on a page being read (slice 13, L3): at most 1,000 a page and 20,000 in all, the oldest going first.
// ponytail: the total is counted per line heard (the queue holds 10,000 pages at most); a running count if it shows in a profile.
export interface Tied {
  room: string;
  msgid: string;
  author: string;
}

const PER_PAGE = 1000;
const IN_ALL = 20_000;

export class Waiting {
  readonly #pages = new Map<string, Tied[]>();

  has(key: string): boolean {
    return this.#pages.has(key);
  }

  size(): number {
    return [...this.#pages.values()].reduce((sum, list) => sum + list.length, 0);
  }

  add(key: string, line: Tied): void {
    const list = this.#pages.get(key) ?? [];
    if (list.some(({ msgid }) => msgid === line.msgid)) return;
    if (list.length >= PER_PAGE) list.shift();
    else if (this.size() >= IN_ALL) this.#dropOldest();
    list.push(line);
    this.#pages.set(key, list);
  }

  // The first page's first line: the page that has waited longest.
  #dropOldest(): void {
    for (const list of this.#pages.values()) if (list.shift() !== undefined) return;
  }

  /** Lets a line go; with `author`, only the author's own. */
  forget(room: string, msgid: string, author?: string): void {
    for (const list of this.#pages.values()) {
      const at = list.findIndex(
        (line) => line.room === room && line.msgid === msgid && (author === undefined || line.author === author),
      );
      if (at !== -1) list.splice(at, 1);
    }
  }

  /** The lines waiting on the page. */
  lines(key: string): readonly Tied[] {
    return this.#pages.get(key) ?? [];
  }

  /** The lines waiting on the page, which then waits no more. */
  take(key: string): Tied[] {
    const list = this.#pages.get(key) ?? [];
    this.#pages.delete(key);
    return list;
  }
}
