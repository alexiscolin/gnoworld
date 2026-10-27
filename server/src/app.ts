// The server's HTTP face (ADR-0002 §7): secure headers on every answer, a small body limit, answers
// that carry a code and never a stack or what the request sent; and the HTTP server's own timeouts.
import { once } from "node:events";
import { Server } from "node:http";
import type { ApiError } from "@gnoworld/schemas";
import { createAdaptorServer } from "@hono/node-server";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { routePath } from "hono/route";
import { secureHeaders } from "hono/secure-headers";
import type { Log } from "./log.ts";

export const BODY_LIMIT = 16 * 1024;
// Headers within 5 s, a whole request within 10 s, an idle kept-alive connection closed after 5 s.
const TIMEOUTS = { headers: 5_000, request: 10_000, keepAlive: 5_000, check: 1_000 };

const refuse = (c: Context, error: ApiError["error"], status: 404 | 413 | 500 | 503): Response =>
  c.json({ error } satisfies ApiError, status);

export function makeApp(log: Log, ready: () => boolean): Hono {
  const app = new Hono();
  app.use(secureHeaders(), named, bodyLimit({ maxSize: BODY_LIMIT, onError: (c) => refuse(c, "too_large", 413) }));
  app.get("/health", (c) => c.text("ok"));
  app.get("/ready", (c) => (ready() ? c.text("ready") : refuse(c, "not_ready", 503)));
  app.notFound((c) => refuse(c, "not_found", 404));
  app.onError((error, c) => {
    // A client that dropped its body mid-way is no server fault.
    if (c.req.raw.signal.aborted) {
      log("aborted", { method: c.req.method, route: routePath(c, -1) });
      return refuse(c, "internal", 500);
    }
    // The name only: a message may quote what the request sent.
    log("failed", { method: c.req.method, route: routePath(c, -1), status: 500, error: error.name });
    return refuse(c, "internal", 500);
  });
  return app;
}

// Hono hands onError only an Error, and catches an Error before it reaches here: anything else thrown
// becomes one, named by its type.
async function named(_: Context, next: () => Promise<void>): Promise<void> {
  try {
    await next();
  } catch (thrown) {
    const error = new Error("a value that is not an Error was thrown", { cause: thrown });
    error.name = typeof thrown;
    throw error;
  }
}

export async function listen(app: Hono, at: { port: number; host: string }, timeouts = TIMEOUTS): Promise<Server> {
  const server = createAdaptorServer({
    fetch: app.fetch,
    serverOptions: {
      headersTimeout: timeouts.headers,
      requestTimeout: timeouts.request,
      keepAliveTimeout: timeouts.keepAlive,
      connectionsCheckingInterval: timeouts.check,
    },
  });
  // HTTP/1.1 options give Node's own HTTP server; the check lets the type say so.
  if (!(server instanceof Server)) throw new TypeError("not an HTTP/1.1 server");
  server.listen(at.port, at.host);
  await once(server, "listening");
  return server;
}

// close() also stops the checks that cut a slow client, so a client stalled in its headers would hold
// the drain for ever: whatever is still open once a request's time is up is cut.
export function stop(server: Server, done: () => void, ms = TIMEOUTS.request): void {
  server.close(done);
  setTimeout(() => {
    server.closeAllConnections();
  }, ms).unref();
}
