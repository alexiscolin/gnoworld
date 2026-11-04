// The one way out of the server (ADR-0002 §7): a call carries its timeout and follows no redirect,
// whatever the caller asks, and what comes back is read up to a size. Where it may go is the egress
// proxy's to decide (slice 3e).
export function send(url: string, init: RequestInit, ms: number): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(ms), redirect: "error" });
}

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
