// What every process's HTTP server shares (ADR-0002 §7): its own timeouts, tightened, a stop that cuts what stalls, and a
// capped body. `server` (app.ts, on Hono's adaptor), `jarvis` (http.ts) and the link reader (server.ts), on Node's own
// server, set theirs through these.
import { strictUtf8 } from "@gnoworld/schemas";
import type { IncomingMessage, Server, ServerOptions } from "node:http";

// Headers within 5 s, a whole request within 10 s, an idle kept-alive connection closed after 5 s.
export const TIMEOUTS = { headers: 5_000, request: 10_000, keepAlive: 5_000, check: 1_000 };

/** Node's HTTP server options for these timeouts. */
export function serverOptions(timeouts = TIMEOUTS): ServerOptions {
  return {
    headersTimeout: timeouts.headers,
    requestTimeout: timeouts.request,
    keepAliveTimeout: timeouts.keepAlive,
    connectionsCheckingInterval: timeouts.check,
  };
}

// close() also stops the checks that cut a slow client, so a client stalled in its headers would hold
// the drain for ever: whatever is still open once a request's time is up is cut.
export function stop(server: Server, done: () => void, ms = TIMEOUTS.request): void {
  server.close(done);
  setTimeout(() => {
    server.closeAllConnections();
  }, ms).unref();
}

/** A request's body as text: undefined past `max` bytes, by its declared length before a byte is read, else once its
 * bytes pass it, never waiting for its end; null for bytes that are no UTF-8. */
export function readBody(request: IncomingMessage, max: number): Promise<string | null | undefined> {
  // No length declared reads as NaN, past no bound.
  if (Number(request.headers["content-length"]) > max) return Promise.resolve(undefined);
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    // The listeners live as long as the request, whose connection closes once a refusal is written; past the bound,
    // its rest is counted and dropped, and the answer, given once, stays.
    request.on("data", (chunk: Buffer) => {
      size += chunk.byteLength;
      if (size <= max) chunks.push(chunk);
      else resolve(undefined);
    });
    request.once("end", () => {
      resolve(strictUtf8(Buffer.concat(chunks)));
    });
    request.once("error", reject);
  });
}
