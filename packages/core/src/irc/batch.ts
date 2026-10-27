// Ergo's batches (ircv3.net/specs/extensions/batch): the lines between BATCH +ref and BATCH -ref, each tagged
// batch=ref, held and handed on whole at the end, so a history page reaches the store at once. The relay is
// untrusted: a batch never ended or ever growing holds no more than its bounds, and a reference is only a key.
import type { IrcMessage } from "./irc.ts";

/** The batches open at once: one more is not opened, and its lines pass on their own. */
export const OPEN_BATCHES = 16;
/** The lines a batch holds: the first kept, the rest dropped. Ergo's page is 1000 at most (ircd.yaml.tmpl). */
export const BATCH_LINES = 1000;

export interface Batch {
  readonly type: string;
  readonly params: readonly string[];
  /** Its BATCH line's tags: a labeled-response's label rides there. */
  readonly tags: IrcMessage["tags"];
  readonly messages: readonly IrcMessage[];
}

/** What a message does: pass (handle it now), held (nothing to do now), or done (a batch, handed on whole). */
export type Batched = { kind: "pass" } | { kind: "held" } | { kind: "done"; batch: Batch };

const HELD: Batched = { kind: "held" };
const PASS: Batched = { kind: "pass" };

interface Open {
  type: string;
  params: readonly string[];
  tags: IrcMessage["tags"];
  messages: IrcMessage[];
}

/** Reads one connection's lines in order; a new connection takes a new reader. */
export class BatchReader {
  readonly #open = new Map<string, Open>();

  read(message: IrcMessage): Batched {
    if (message.command === "BATCH") return this.#batch(message.params, message.tags);
    const open = this.#open.get(message.tags.get("batch") ?? "");
    if (open === undefined) return PASS;
    if (open.messages.length < BATCH_LINES) open.messages.push(message);
    return HELD;
  }

  // BATCH +ref type params... opens; BATCH -ref ends; anything else does nothing.
  #batch([sign = "", type = "", ...params]: readonly string[], tags: IrcMessage["tags"]): Batched {
    const ref = sign.slice(1);
    if (ref === "") return HELD;
    if (sign.startsWith("-")) return this.#end(ref);
    if (sign.startsWith("+") && type !== "" && !this.#open.has(ref) && this.#open.size < OPEN_BATCHES) {
      this.#open.set(ref, { type, params, tags, messages: [] });
    }
    return HELD;
  }

  #end(ref: string): Batched {
    const open = this.#open.get(ref);
    if (open === undefined) return HELD;
    this.#open.delete(ref);
    return { kind: "done", batch: open };
  }
}
