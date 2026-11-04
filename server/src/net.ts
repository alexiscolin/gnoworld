// The one way out of the server (ADR-0002 §7): a call carries its timeout and follows no redirect,
// whatever the caller asks, and what comes back is read up to a size. Where it may go is the egress
// proxy's to decide (slice 3e).
/** The one way out's shape, which a caller's test stands in for. */
export type Send = (url: string, init: RequestInit, ms: number) => Promise<Response>;

export const send: Send = (url, init, ms) => {
  // The caller's own signal stops it too: the first of the two to fire, so its timeout always holds.
  const timeout = AbortSignal.timeout(ms);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return fetch(url, { ...init, signal, redirect: "error" });
};

/** The body's text, at most `max` bytes of it; undefined for a longer one, whose stream is cut off. */
export async function readCapped(response: Response, max: number): Promise<string | undefined> {
  const reader = response.body?.getReader();
  if (reader === undefined) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const part: { done: boolean; value?: Uint8Array } = await reader.read();
    if (part.done || part.value === undefined) break;
    size += part.value.byteLength;
    if (size > max) {
      try {
        await reader.cancel();
      } catch {
        // Cut off already, or failing to be: the answer is refused either way.
      }
      return undefined;
    }
    chunks.push(part.value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** The body's JSON, at most `max` bytes of it; undefined for a longer one, or for text that is no JSON. */
export async function readJson(response: Response, max: number): Promise<unknown> {
  const text = await readCapped(response, max);
  try {
    return text === undefined ? undefined : JSON.parse(text);
  } catch {
    // Text that is no JSON is an answer of no shape, as one too long is.
    return undefined;
  }
}
