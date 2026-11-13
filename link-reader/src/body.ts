// The body of a reply over an open connection: chunked coding, a declared length, or to the end of the connection.
import { Refused } from "./fetch.ts";
import type { Kind } from "./fetch.ts";

/** What a socket's end means: the request's own signal (a timeout) or the connection's (a network fault). */
export const kindOf = (signal: AbortSignal): Kind => (signal.aborted ? "timeout" : "network");
export const ended = { done: true as const, value: undefined };
/** A size line is hex and an optional extension: past this with no newline, the reply is not HTTP. */
const LINE_MAX = 1024;

// What the body is read from: lines and runs of bytes out of the chunks that follow the head.
interface Feed {
  line: () => Promise<string>;
  take: (most: number) => Promise<Buffer | undefined>;
}
export function feedOf(chunks: AsyncIterator<Buffer>, first: Buffer, signal: AbortSignal): Feed {
  let held = first;
  const more = async (): Promise<boolean> => {
    const next = await chunks.next().catch(() => ended);
    if (next.done === true) return false;
    held = Buffer.concat([held, next.value]);
    return true;
  };
  const line = async (): Promise<string> => {
    for (;;) {
      const at = held.indexOf(10);
      if (at >= 0) {
        const text = held.subarray(0, at).toString("latin1");
        held = held.subarray(at + 1);
        return text;
      }
      if (held.length > LINE_MAX) throw new Refused("network");
      if (!(await more())) throw new Refused(kindOf(signal));
    }
  };
  const take = async (most: number): Promise<Buffer | undefined> => {
    if (held.length === 0 && !(await more())) return undefined;
    const part = held.subarray(0, most);
    held = held.subarray(part.length);
    return part;
  };
  return { line, take };
}

// Chunked coding: a size in hex (an extension ignored), that many bytes, a blank line, until a size of 0.
async function* chunked({ line, take }: Feed, signal: AbortSignal): AsyncGenerator<Uint8Array> {
  for (;;) {
    let text = (await line()).trim();
    while (text === "") text = (await line()).trim();
    const size = parseInt(text.split(";")[0] ?? "", 16);
    if (Number.isNaN(size)) throw new Refused("network");
    if (size === 0) return;
    for (let left = size; left > 0;) {
      const part = await take(left);
      if (part === undefined) throw new Refused(kindOf(signal));
      yield part;
      left -= part.length;
    }
  }
}

// A body of a declared length, or to the end of the connection when it declares none.
async function* sized({ take }: Feed, declared: number | undefined, signal: AbortSignal): AsyncGenerator<Uint8Array> {
  let got = 0;
  while (declared === undefined || got < declared) {
    const part = await take(declared === undefined ? Infinity : declared - got);
    if (part === undefined) {
      if (declared !== undefined || signal.aborted) throw new Refused(kindOf(signal));
      return;
    }
    got += part.length;
    yield part;
  }
}

export function bodyOf(feed: Feed, headers: Record<string, string>, signal: AbortSignal): AsyncGenerator<Uint8Array> {
  if ((headers["transfer-encoding"] ?? "").toLowerCase().includes("chunked")) return chunked(feed, signal);
  const length = headers["content-length"] ?? "";
  return sized(feed, /^[0-9]+$/.test(length) ? Number(length) : undefined, signal);
}
