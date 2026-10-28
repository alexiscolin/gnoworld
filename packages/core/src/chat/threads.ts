// A room's threads (slice 4's 4d; docs/plans/chat-features.md, M3): a thread is no object of its own but a chain of
// replies (+reply, Line.reply), read from the lines the room holds. Its root is the line at the top of the chain; a
// reply to a reply stays in the root's thread, one flat list in the room's order.

/** What a line holds of a thread: its msgid, and the msgid of the line it answers (Line.reply, 4d's replies). */
export interface Threaded {
  readonly id: string;
  readonly reply?: string | undefined;
}

/** The threads of a room's lines. */
export interface Threads<T extends Threaded> {
  /** Each reply's thread, by the reply's msgid: the msgid of the thread's root, a line of the window or not. */
  readonly rootOf: ReadonlyMap<string, string>;
  /** Each root's replies, by the root's msgid, flat, in the lines' order; only a root with a reply is a key. */
  readonly repliesOf: ReadonlyMap<string, readonly T[]>;
}

/** The threads of `lines`; `resolve` reads a folded edit's msgid as its line's. A reply to its own line or a later one
 * answers nothing, so no chain loops; one to a line the window lacks is in that msgid's thread. One pass, no recursion,
 * Maps: a msgid a sender chose is only a key. */
export function threadsOf<T extends Threaded>(
  lines: readonly T[],
  resolve: (id: string) => string = (id) => id,
): Threads<T> {
  const every = new Set(lines.map(({ id }) => id));
  const before = new Set<string>();
  const rootOf = new Map<string, string>();
  const repliesOf = new Map<string, T[]>();
  for (const line of lines) {
    const target = line.reply === undefined ? undefined : resolve(line.reply);
    // A line of the window that has not come yet, or this one, is no target; one the window lacks is a root gone. The
    // window's order is time then msgid: a reply of the root's own millisecond, its msgid first, is held before it (CR8).
    if (target !== undefined && (before.has(target) || !every.has(target))) {
      const root = rootOf.get(target) ?? target;
      rootOf.set(line.id, root);
      const held = repliesOf.get(root);
      if (held === undefined) repliesOf.set(root, [line]);
      else held.push(line);
    }
    before.add(line.id);
  }
  return { rootOf, repliesOf };
}
