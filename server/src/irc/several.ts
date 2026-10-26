// The messages of several lines Ergo relays to a reader with draft/multiline (slice 4): a batch whose opening line
// holds the message's id, time and account, each part a PRIVMSG of it. Held until the batch ends, then read as one
// message (core's foldMultiline), so each line of it is checked; a reader without the capability would get the
// parts as lines of their own, the id on the first alone (irc/client.go, v2.19.1).
import { foldMultiline, MULTILINE, type Batch, type IrcMessage } from "@gnoworld/core";

// Messages open at once, and the parts one holds; past them a batch is not held, its parts dropped (Ergo's cap is
// 40 lines). The relay is Ergo's own, so these only bound memory.
const MAX_OPEN = 16;
const MAX_PARTS = 64;

export interface Several {
  /** A BATCH line of a message of several lines, which it takes (true), the message at its end handed to `done`. */
  batch: (message: IrcMessage, done: (folded: IrcMessage) => void) => boolean;
  /** A part of a message open, which it holds (true). */
  hold: (message: IrcMessage) => boolean;
  clear: () => void;
}

export function several(): Several {
  const open = new Map<string, Batch & { messages: IrcMessage[] }>();
  return {
    batch: ({ params: [sign = "", type, ...rest], tags, source }, done) => {
      const ref = sign.slice(1);
      if (sign.startsWith("+") && type === MULTILINE) {
        if (open.size < MAX_OPEN) {
          open.set(ref, { type, params: rest, messages: [], tags, ...(source === undefined ? {} : { source }) });
        }
        return true;
      }
      const batch = open.get(ref);
      if (!sign.startsWith("-") || batch === undefined) return false;
      open.delete(ref);
      const folded = foldMultiline(batch);
      // Inside a history page, it stays one line of it: counted there, as the page's own.
      const page = batch.tags.get("batch");
      if (folded !== undefined) {
        done(page === undefined ? folded : { ...folded, tags: new Map([...folded.tags, ["batch", page]]) });
      }
      return true;
    },
    hold: (message) => {
      const batch = open.get(message.tags.get("batch") ?? "");
      if (batch !== undefined && batch.messages.length < MAX_PARTS) batch.messages.push(message);
      return batch !== undefined;
    },
    clear: () => {
      open.clear();
    },
  };
}
