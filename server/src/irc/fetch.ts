// One line of a room by its id, as Ergo holds it (slice 4's 4d, pins): CHATHISTORY AROUND <room> msgid=<id> 1 answers
// that line alone, or an empty batch when Ergo holds none (tried on v2.19.1). Ergo answers its commands in order and a
// batch is never split, so a batch is a question's by its place among the history requests sent, which the link
// keeps; its lines then go to the question alone, never to the checks and counts a heard line goes to.
import type { Said } from "./lines.ts";

/** What Ergo said of a line: the line, that it holds none, or nothing in time (a link not in its rooms, a word
 * that is no room or id, a wait that ran out): a pin is dropped only for the second. */
export type Fetched = Said | "gone" | "unanswered";

// Ergo's own ids are 26 characters; one word of 128 at most, no comma or control character, as the pins' schema says.
const MSGID = /^[^\s,\0-\x1f\x7f]{1,128}$/;
// The history requests unanswered at most, those of a question that gave up among them; past it, none is asked.
const REQUESTS = 1000;

interface Pending {
  room: string;
  msgid: string;
  found: Said | undefined;
  promise: Promise<Fetched>;
  resolve: (answer: Fetched) => void;
  timer: ReturnType<typeof setTimeout>;
}

// A history request sent, in order: the question it was, or none for a catch-up page; a question that gave up keeps
// its place, so its late batch is not taken for a page.
interface Request {
  room: string;
  pending: Pending | undefined;
}

export interface Fetches {
  // One question for a line asked twice at once; the CHATHISTORY is written once it is in its form.
  ask: (write: (command: string, params: readonly string[]) => void, room: string, msgid: string) => Promise<Fetched>;
  // The link wrote a catch-up page's CHATHISTORY for this room.
  paged: (room: string) => void;
  // A chathistory batch opened: whether it answers a question, whose lines it then holds (`line`).
  opened: (ref: string, room: string) => boolean;
  line: (ref: string, heard: Said | undefined) => void;
  closed: (ref: string) => void;
  // Ergo refused a CHATHISTORY: no batch comes for it.
  failed: () => void;
  // The connection closed: each question answered with nothing, none held.
  drop: () => void;
}

export function lineFetches(timeoutMs: number): Fetches {
  const asked = new Map<string, Pending>();
  const requests: Request[] = [];
  // The batches open that answer a question, by reference.
  const open = new Map<string, Pending | undefined>();
  const done = (pending: Pending, answer: Fetched): void => {
    clearTimeout(pending.timer);
    if (asked.get(`${pending.room} ${pending.msgid}`) === pending) asked.delete(`${pending.room} ${pending.msgid}`);
    pending.resolve(answer);
  };
  return {
    ask(write, room, msgid) {
      const key = `${room} ${msgid}`;
      const known = asked.get(key);
      if (known !== undefined) return known.promise;
      if (!MSGID.test(msgid) || requests.length >= REQUESTS) return Promise.resolve("unanswered");
      let resolve: Pending["resolve"] = () => undefined;
      const promise = new Promise<Fetched>((settle) => {
        resolve = settle;
      });
      const timer = setTimeout(() => {
        const pending = asked.get(key);
        if (pending !== undefined) done(pending, "unanswered");
      }, timeoutMs);
      const pending: Pending = { room, msgid, found: undefined, promise, resolve, timer };
      write("CHATHISTORY", ["AROUND", room, `msgid=${msgid}`, "1"]);
      asked.set(key, pending);
      requests.push({ room, pending });
      return promise;
    },
    paged(room) {
      // Never dropped, whatever the questions fill: a dropped page leaves its batch to the next question. The catch-up has one
      // page in flight, so the list is bounded by REQUESTS and one.
      requests.push({ room, pending: undefined });
    },
    opened(ref, room) {
      const [head] = requests;
      // A batch of another room than the next request's: the order is lost, so it is a page's, and none is waited for.
      if (head?.room !== room) {
        requests.length = 0;
        return false;
      }
      requests.shift();
      if (head.pending === undefined) return false;
      open.set(ref, head.pending);
      return true;
    },
    line(ref, heard) {
      const pending = open.get(ref);
      if (pending !== undefined && heard?.msgid === pending.msgid) pending.found = heard;
    },
    closed(ref) {
      const pending = open.get(ref);
      open.delete(ref);
      // A question's batch only: `done` lets a question already answered be.
      if (pending !== undefined) done(pending, pending.found ?? "gone");
    },
    failed() {
      const pending = requests.shift()?.pending;
      if (pending !== undefined) done(pending, "unanswered");
    },
    drop() {
      requests.length = 0;
      open.clear();
      for (const pending of [...asked.values()]) done(pending, "unanswered");
    },
  };
}
