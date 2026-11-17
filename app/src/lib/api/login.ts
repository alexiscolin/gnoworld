// The browser's client of the server's login (server/src/login/routes.ts, mounted at /api/login), through the
// one JSON call of lib/api/http.ts. The session is the server's HttpOnly cookie, which the page never reads.
import { Challenge, Me, Nonce, Ticket, type Address, type Proof } from "@gnoworld/schemas";
import { z } from "../jitless.ts";
import { jsonCall, TIMEOUT_MS, type Call, type Fetcher, type Result } from "./http.ts";

export type { Fetcher, Result } from "./http.ts";

/** The most the server reads of a pasted file, in bytes (server/src/login/cliProof.ts). */
export const FILE_MAX_BYTES = 4096;
/** Whether a pasted file is more than the server reads: never sent. */
export const tooBig = (file: string): boolean => new TextEncoder().encode(file).length > FILE_MAX_BYTES;
/** A command-line code: the login's, a link's and a release's (links.ts); the block is the server's, shown as it came. */
export const CliChallenge = z.object({
  nonce: Nonce,
  memo: z.string().check(z.maxLength(1024)),
  block: z.string().check(z.minLength(1), z.maxLength(8192)),
  expiresAt: z.iso.datetime(),
});
export type CliChallenge = z.infer<typeof CliChallenge>;

export function loginApi(fetcher: Fetcher, timeoutMs = TIMEOUT_MS) {
  const call = jsonCall(fetcher, timeoutMs);
  const send = <T>(sent: Call<T>) => call({ ...sent, path: `/api/login/${sent.path}` });
  // The account logged in must be the one that proved.
  const named = (result: Result<Me>, address: Address): Result<Me> =>
    result.ok && result.value.address !== address ? { ok: false, reason: "malformed" } : result;

  return {
    /** A challenge to sign, for the chain Adena is on. */
    challenge: (chainId: string) => send({ path: "challenge", body: { chainId }, schema: Challenge }),
    /** The proof posted; the account logged in, which must be the one that signed. */
    verify: async (request: { nonce: string; address: Address; proof: Proof }): Promise<Result<Me>> =>
      named(await send({ path: "verify", body: request, schema: Me }), request.address),
    /** A code and the block to copy, for the command-line key of `address` (D13880). */
    cliChallenge: (address: Address) => send({ path: "cli/challenge", body: { address }, schema: CliChallenge }),
    /** The file the command-line tool wrote, as it was pasted: at most 4 KiB, which the server reads. */
    verifyFile: async (request: { nonce: string; address: Address; file: string }): Promise<Result<Me>> =>
      tooBig(request.file)
        ? { ok: false, reason: "refused" }
        : named(await send({ path: "cli/verify", body: request, schema: Me }), request.address),
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
