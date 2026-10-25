// The browser's client of the server's login (server/src/login/routes.ts, mounted at /api/login): each answer
// read through its schema, each failure a reason the page can act on. The session is the server's HttpOnly
// cookie, sent to this site alone; a redirect is never followed, since it would carry the proof elsewhere.
import { ApiError, Challenge, Me, Ticket, type Address, type Proof } from "@gnoworld/schemas";
import { z } from "zod";

/** The time a call has, its body read included: the server's own request timeout (server/src/app.ts). */
export const TIMEOUT_MS = 10_000;

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
type Reason = ApiError["error"] | "unavailable" | "malformed" | "network";
export type Result<T> = { ok: true; value: T } | { ok: false; reason: Reason };

interface Call<T> {
  path: string;
  body?: unknown;
  schema: z.ZodType<T>;
}

// The answer read whole, or why not: a body that breaks off is the network's, a body that is no JSON malformed.
async function read(response: Response): Promise<{ text: string } | "network"> {
  try {
    return { text: await response.text() };
  } catch {
    return "network";
  }
}

const parse = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

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
  const value = got.text === "" ? undefined : parse(got.text);
  if (response.status !== 200 && response.status !== 204) return { ok: false, reason: refusal(response.status, value) };
  const parsed = schema.safeParse(value);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, reason: "malformed" };
}

export function loginApi(fetcher: Fetcher, timeoutMs = TIMEOUT_MS) {
  // One call, its answer read before its time runs out; the timer cleared whatever happens.
  async function send<T>(call: Call<T>): Promise<Result<T>> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort(new DOMException("the login's server took too long", "TimeoutError"));
    }, timeoutMs);
    try {
      return await answerOf(await fetcher(`/api/login/${call.path}`, requestOf(call.body, controller.signal)), call);
    } catch {
      return { ok: false, reason: "network" };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    /** A challenge to sign, for the chain Adena is on. */
    challenge: (chainId: string) => send({ path: "challenge", body: { chainId }, schema: Challenge }),
    /** The proof posted; the account logged in, which must be the one that signed. */
    verify: async (request: { nonce: string; address: Address; proof: Proof }): Promise<Result<Me>> => {
      const result = await send({ path: "verify", body: request, schema: Me });
      return result.ok && result.value.address !== request.address ? { ok: false, reason: "malformed" } : result;
    },
    /** A ticket for one connection to Ergo. */
    ticket: () => send({ path: "ticket", body: {}, schema: Ticket }),
    /** Who is logged in, or nobody (null). */
    me: () => send({ path: "me", schema: Me }),
    /** The session ended, its cookie cleared by the server. */
    logout: () => send({ path: "logout", body: {}, schema: z.undefined() }),
  };
}

/** The login's client of this page, on its own fetch. */
export const pageLoginApi = () => loginApi((url, init) => fetch(url, init));
