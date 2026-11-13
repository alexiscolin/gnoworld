// A call to the server's JSON API, as every client in lib makes it: each answer read through its schema, each
// failure a reason the page can act on; the cookie to this site alone; a redirect refused, never followed,
// since it could carry what the call sent elsewhere; a time limit over the answer's body too.
import { jsonOf } from "@gnoworld/core";
import { ApiError } from "@gnoworld/schemas";
import type * as z from "zod/mini";
import type { GatedFetch } from "../query/policy.ts";

/** The time a call has, its body read included: the server's own request timeout (server/src/app.ts). */
export const TIMEOUT_MS = 10_000;

export type Fetcher = GatedFetch;
type Reason = ApiError["error"] | "unavailable" | "malformed" | "network";
/** A refusal's `body` is the server's answer as it came, for a client that reads more than its code (the guest chat's cause). */
export type Result<T> = { ok: true; value: T } | { ok: false; reason: Reason; body?: unknown };

export interface Call<T> {
  /** The path on this site, from its root. */
  path: string;
  body?: unknown;
  schema: z.ZodMiniType<T>;
  /** Ends the call early, as the time limit does. */
  signal?: AbortSignal | undefined;
}

// The answer read whole, or why not: a body that breaks off is the network's, a body that is no JSON malformed.
async function read(response: Response): Promise<{ text: string } | "network"> {
  try {
    return { text: await response.text() };
  } catch {
    return "network";
  }
}

// A refusal: the server's own code, else what its status says.
function refusal(status: number, body: unknown): Reason {
  const known = ApiError.safeParse(body);
  if (known.success) return known.data.error;
  if (status === 429) return "too_many";
  return status >= 500 ? "unavailable" : "malformed";
}

// A GET, or a POST of JSON; the cookie to this site alone; a redirect refused, never followed.
const requestOf = (body: unknown, signal: AbortSignal): RequestInit => ({
  method: body === undefined ? "GET" : "POST",
  credentials: "same-origin",
  redirect: "error",
  signal,
  ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
});

async function answerOf<T>(response: Response, { schema }: Call<T>): Promise<Result<T>> {
  const got = await read(response);
  if (got === "network") return { ok: false, reason: "network" };
  const value = got.text === "" ? undefined : jsonOf(got.text);
  if (response.status !== 200 && response.status !== 204)
    return { ok: false, reason: refusal(response.status, value), body: value };
  const parsed = schema.safeParse(value);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, reason: "malformed" };
}

/** A client's one way to call the server: one call, its answer read before its time runs out, the timer and the listener
 * on the caller's signal cleared whatever happens. The time stops while the page's per-host queue holds the call. */
export function jsonCall(fetcher: Fetcher, timeoutMs = TIMEOUT_MS) {
  return async <T>(call: Call<T>): Promise<Result<T>> => {
    const { signal: outer } = call;
    if (outer?.aborted === true) return { ok: false, reason: "network" };
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const time = (running: boolean) => {
      clearTimeout(timer);
      if (!running) return;
      timer = setTimeout(() => {
        controller.abort(new DOMException("the server took too long", "TimeoutError"));
      }, timeoutMs);
    };
    const leave = () => {
      controller.abort(outer?.reason);
    };
    time(true);
    outer?.addEventListener("abort", leave, { once: true });
    try {
      const init = {
        ...requestOf(call.body, controller.signal),
        onWait: (waiting: boolean) => {
          time(!waiting);
        },
      };
      return await answerOf(await fetcher(call.path, init), call);
    } catch {
      return { ok: false, reason: "network" };
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener("abort", leave);
    }
  };
}

/** A client's GETs: `get(schema, pathOf)` is a reader that calls the path `pathOf(arg)` and reads the answer through `schema`. */
export function getter(fetcher: Fetcher, timeoutMs = TIMEOUT_MS) {
  const call = jsonCall(fetcher, timeoutMs);
  return <A, T>(schema: z.ZodMiniType<T>, pathOf: (arg: A) => string) =>
    (arg: A, signal?: AbortSignal): Promise<Result<T>> =>
      call({ path: pathOf(arg), schema, signal });
}
