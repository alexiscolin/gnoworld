// Ergo's batches (ircv3.net/specs/extensions/batch): the lines between BATCH +ref and BATCH -ref, each tagged
// batch=ref, held and handed on whole at the end, so a history page reaches the store at once. A message of several
// lines inside a page (draft/multiline) is folded into the page, in its place (multiline.ts). The relay is
// untrusted: a batch never ended or ever growing holds no more than its bounds, and a reference is only a key.
import type { IrcMessage } from "./irc.ts";
import { foldMultiline, MULTILINE } from "./multiline.ts";

/** The batches open at once: one more is not opened, and its lines pass on their own. */
export const OPEN_BATCHES = 16;
/** The lines a batch holds: the first kept, the rest dropped. Ergo's page is 1000 at most (ircd.yaml.tmpl). */
export const BATCH_LINES = 1000;

export interface Batch {
  readonly type: string;
  readonly params: readonly string[];
  readonly messages: readonly IrcMessage[];
  /** The opening line's tags: a multiline message's id, time and account. */
  readonly tags: ReadonlyMap<string, string>;
  /** The opening line's source: a multiline message's sender. */
  readonly source?: string;
}

/** What a message does: pass (handle it now), held (nothing to do now), or done (a batch, handed on whole). */
export type Batched = { kind: "pass" } | { kind: "held" } | { kind: "done"; batch: Batch };

const HELD: Batched = { kind: "held" };
const PASS: Batched = { kind: "pass" };

interface Open {
  batch: Batch & { messages: IrcMessage[] };
  /** The batch its opening line sits in, "" for none. */
  parent: string;
}

/** Reads one connection's lines in order; a new connection takes a new reader. */
export class BatchReader {
  readonly #open = new Map<string, Open>();

  read(message: IrcMessage): Batched {
    if (message.command === "BATCH") return this.#batch(message);
    const open = this.#open.get(message.tags.get("batch") ?? "");
    if (open === undefined) return PASS;
    hold(open, message);
    return HELD;
  }

  // BATCH +ref type params... opens; BATCH -ref ends; anything else does nothing.
  #batch({ params: [sign = "", type = "", ...params], tags, source }: IrcMessage): Batched {
    const ref = sign.slice(1);
    if (ref === "") return HELD;
    if (sign.startsWith("-")) return this.#end(ref);
    if (sign.startsWith("+"))
      this.#begin(ref, { type, params, messages: [], tags, ...(source === undefined ? {} : { source }) });
    return HELD;
  }

  // A batch opens with a type, its reference free, while fewer than OPEN_BATCHES are open.
  #begin(ref: string, batch: Open["batch"]): void {
    if (batch.type !== "" && !this.#open.has(ref) && this.#open.size < OPEN_BATCHES) {
      this.#open.set(ref, { batch, parent: batch.tags.get("batch") ?? "" });
    }
  }

  // A batch ended: handed on, or a multiline one folded into the batch it sits in, still open.
  #end(ref: string): Batched {
    const open = this.#open.get(ref);
    if (open === undefined) return HELD;
    this.#open.delete(ref);
    const parent = this.#open.get(open.parent);
    if (open.batch.type !== MULTILINE || parent === undefined) return { kind: "done", batch: open.batch };
    const folded = foldMultiline(open.batch);
    if (folded !== undefined) hold(parent, folded);
    return HELD;
  }
}

// A line held in its batch, the first BATCH_LINES kept.
function hold({ batch }: Open, message: IrcMessage): void {
  if (batch.messages.length < BATCH_LINES) batch.messages.push(message);
}
