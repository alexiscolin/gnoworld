// The guard of every route that changes something (slice 3's plan, 3c, 3l): no answer is cached, and a
// request that is no GET comes from a listed Origin and in JSON, the CSRF guard: Hono's own csrf() checks
// form types only.
import { jsonOf } from "@gnoworld/core";
import type { ApiError } from "@gnoworld/schemas";
import type { Context, MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { routePath } from "hono/route";
import type { Log } from "@gnoworld/service/log";

// The host of the request's Origin, which the guard checked.
export interface Guarded {
  Variables: { host: string };
}

export function guard(
  origins: readonly string[],
  refuse: (c: Context, cause: "origin" | "type") => Response,
): MiddlewareHandler<Guarded> {
  const hosts = new Map(origins.map((origin) => [origin, new URL(origin).host]));
  return async (c, next) => {
    c.header("cache-control", "no-store");
    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
      const host = hosts.get(c.req.header("origin") ?? "");
      if (host === undefined) return refuse(c, "origin");
      if (!/^application\/json\s*(;|$)/i.test(c.req.header("content-type") ?? "")) return refuse(c, "type");
      c.set("host", host);
    }
    await next();
    return undefined;
  };
}

// The body's JSON, or undefined for text that is not JSON, which the schema then refuses like any bad
// body. Hono's body limit checks a declared length at once, and reads a body with none (chunked) whole before
// a route runs (hono/body-limit, 4.13.13).
export async function json(c: Context): Promise<unknown> {
  return jsonOf(await c.req.text());
}

/** The login's session token of a request: its one cookie. */
export const tokenOf = (c: Context): string | undefined => getCookie(c, "__Host-session");

/** What the session `session` knows of a request's cookie (an account, or none). */
export const sessionOf = <T>(c: Context, session: (token: string | undefined) => T): T => session(tokenOf(c));

/** A route's refusals: each cause's error word and status. */
export type Refusals = Record<string, readonly [ApiError["error"], 400 | 401 | 403 | 404 | 409 | 415 | 429 | 503]>;

/** The causes every route refuses alike: its Origin, its type, its session, its body and its rate. */
export const baseRefusals = {
  origin: ["forbidden", 403],
  type: ["unsupported", 415],
  session: ["unauthenticated", 401],
  body: ["refused", 400],
  limit: ["too_many", 429],
} as const satisfies Refusals;

/** The `refuse` of a route: logs `event` with the route, the status and the cause (and `extra`), answers the cause's error. */
export const refuserOf =
  <C extends string>(log: Log, event: string, refusals: Record<C, Refusals[string]>) =>
  (c: Context, cause: C, extra: Record<string, unknown> = {}): Response => {
    const [error, status] = refusals[cause];
    log(event, { route: routePath(c), status, error: cause, ...extra });
    return c.json({ error } satisfies ApiError, status);
  };
