// The browser's client of the server's login (server/src/login/routes.ts, mounted at /api/login), through the
// one JSON call of lib/api/http.ts. The session is the server's HttpOnly cookie, which the page never reads.
import { Challenge, Me, Ticket, type Address, type Proof } from "@gnoworld/schemas";
import { z } from "zod";
import { jsonCall, TIMEOUT_MS, type Fetcher, type Result } from "./http.ts";

export { TIMEOUT_MS, type Fetcher, type Result } from "./http.ts";

export function loginApi(fetcher: Fetcher, timeoutMs = TIMEOUT_MS) {
  const call = jsonCall(fetcher, timeoutMs);
  const send = <T>(sent: { path: string; body?: unknown; schema: z.ZodType<T> }) =>
    call({ ...sent, path: `/api/login/${sent.path}` });

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
