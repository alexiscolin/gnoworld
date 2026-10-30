// The hides the link sent and Ergo has not yet taken (F2462). Ergo relays a room's line to its members, then writes it
// into its history (channel.go:1418, then 1424), so a REDACT sent on the line just read can arrive first and be
// refused UNKNOWN_MSGID: the id is not yet known, nothing was hidden. Only a REDACT the link sent itself is asked
// again, a few times and a little later, on the same connection; the author's NOTICE and the strike are not sent twice,
// since they belong to the verdict, not to this.

// How many times a refused hide is asked again, the wait doubling from the first (250 ms to 8 s by default, 15.75 s in
// all): Ergo waits up to 10 s for a writer that holds its SQLite history (irc/sqlite/history.go busy_timeout), and the
// line's id is unknown until that write lands. A line really gone (its author deleted it) stops there, with no alert.
const REDACT_RETRIES = 6;
// Past this many hides waiting for Ergo's word, the oldest is let go.
const WAITING_MAX = 1000;

interface Waiting {
  params: readonly string[];
  tries: number;
  timer: ReturnType<typeof setTimeout> | undefined;
}

/** What asks again: the hide to send, and the wait before it. */
interface Again {
  send: (params: readonly string[]) => void;
  /** The first wait; each next one is twice the one before. */
  ms: number;
  /** The last ask was spent: Ergo never knew the line, or has not by now. */
  gaveUp: () => void;
}

export interface Redacts {
  /** A REDACT sent by the link: Ergo's word on it is waited for. */
  sent: (params: readonly string[]) => void;
  /** Ergo refused it as unknown: asked again after the delay if it was ours and under the bound, else given up. */
  unknown: (room: string, msgid: string, again: Again) => void;
  /** Ergo took the hide, or refused it for good: nothing more to ask. */
  done: (room: string, msgid: string) => void;
  /** The connection ended: no retry crosses to the next one. */
  clear: () => void;
}

const keyOf = (room: string, msgid: string): string => `${room} ${msgid}`;

export function makeRedacts(): Redacts {
  const waiting = new Map<string, Waiting>();
  const drop = (key: string): void => {
    clearTimeout(waiting.get(key)?.timer);
    waiting.delete(key);
  };
  return {
    sent: (params) => {
      const [room = "", msgid = ""] = params;
      const key = keyOf(room, msgid);
      if (waiting.has(key)) return;
      const oldest = waiting.keys().next();
      if (waiting.size >= WAITING_MAX && oldest.done !== true) drop(oldest.value);
      waiting.set(key, { params, tries: 0, timer: undefined });
    },
    unknown: (room, msgid, again) => {
      const key = keyOf(room, msgid);
      const entry = waiting.get(key);
      if (entry === undefined || entry.timer !== undefined) return;
      if (entry.tries >= REDACT_RETRIES) {
        waiting.delete(key);
        again.gaveUp();
        return;
      }
      entry.tries += 1;
      const wait = again.ms * 2 ** (entry.tries - 1);
      entry.timer = setTimeout(() => {
        entry.timer = undefined;
        again.send(entry.params);
      }, wait);
    },
    done: (room, msgid) => {
      drop(keyOf(room, msgid));
    },
    clear: () => {
      for (const key of [...waiting.keys()]) drop(key);
    },
  };
}
