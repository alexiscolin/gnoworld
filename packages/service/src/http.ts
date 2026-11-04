// What every process's HTTP server shares (ADR-0002 §7): its own timeouts, tightened, and a stop that cuts what stalls.
// `server` (app.ts, on Hono's adaptor) and `jarvis` (http.ts, on Node's own server) set theirs through these.
import type { Server, ServerOptions } from "node:http";

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
