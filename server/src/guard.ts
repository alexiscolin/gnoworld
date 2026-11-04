// The guard of every route that changes something (slice 3's plan, 3c, 3l): no answer is cached, and a
// request that is no GET comes from a listed Origin and in JSON, the CSRF guard: Hono's own csrf() checks
// form types only.
import { jsonOf } from "@gnoworld/core";
import type { Context, MiddlewareHandler } from "hono";

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
