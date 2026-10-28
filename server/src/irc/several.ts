// The messages of several lines Ergo relays to a reader with draft/multiline (slice 4): a batch whose opening line
// holds the message's id, time and account, each part a PRIVMSG of it, held until its end and read as one message
// (core's foldMultiline), so each line is checked. Fail closed (G1, G5): a batch it cannot hold whole and fold (a
// part core refuses, more parts than Ergo's cap, a 17th open at once) is handed on as hidden by its opening line's id,
// never folded in part, never left unjudged: Ergo relays and keeps it all the same (irc/client.go, v2.19.1).
import { foldMultiline, MULTILINE, MULTILINE_LINES, OPEN_BATCHES, type Batch, type IrcMessage } from "@gnoworld/core";

// What is said of a message nobody could read: no one reads it, it is only the text a hidden line needs to be one.
const UNREAD = "(a message of several lines the bot could not read whole)";

// A message's opening line, its params the room and a stand-in text, to be hidden by its id. A batch with no target
// names no room.
const unread = (opening: IrcMessage, target = ""): IrcMessage => ({ ...opening, params: [target, UNREAD] });

export interface Several {
  /**
   * A BATCH line of a message of several lines, which it takes (true). The message is handed to `done` at its end,
   * whole (true), or as the stand-in of one it could not read (false), which is to be hidden.
   */
  batch: (message: IrcMessage, done: (message: IrcMessage, whole: boolean) => void) => boolean;
  /** A part of a message open, which it holds (true). */
  hold: (message: IrcMessage) => boolean;
  clear: () => void;
}

export function several(): Several {
  const open = new Map<string, Batch & { messages: IrcMessage[]; stand: IrcMessage }>();
  return {
    batch: (message, done) => {
      const {
        params: [sign = "", type, ...rest],
        tags,
        source,
      } = message;
      const ref = sign.slice(1);
      if (sign.startsWith("+") && type === MULTILINE) {
        const stand = unread(message, rest[0]);
        if (open.size < OPEN_BATCHES) {
          open.set(ref, { type, params: rest, messages: [], tags, stand, ...(source === undefined ? {} : { source }) });
        } else done(stand, false);
        return true;
      }
      const batch = open.get(ref);
      if (!sign.startsWith("-") || batch === undefined) return false;
      open.delete(ref);
      const folded = foldMultiline(batch);
      // Inside a history page, it stays one line of it: counted there, as the page's own.
      const page = batch.tags.get("batch");
      if (folded === undefined) done(batch.stand, false);
      else done(page === undefined ? folded : { ...folded, tags: new Map([...folded.tags, ["batch", page]]) }, true);
      return true;
    },
    hold: (message) => {
      const batch = open.get(message.tags.get("batch") ?? "");
      // One part past Ergo's cap is held, so the fold refuses the batch; the parts after it are dropped, for memory.
      if (batch !== undefined && batch.messages.length <= MULTILINE_LINES) batch.messages.push(message);
      return batch !== undefined;
    },
    clear: () => {
      open.clear();
    },
  };
}
