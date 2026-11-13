// The browser's client of the linked accounts (server/src/login/linkRoutes.ts, mounted at /api/links; owners' moderation, part 5), through the one
// JSON call of lib/api/http.ts. The session is the server's cookie; no key is held or sent: a link is proven by Adena's signature or by the file the
// command-line tool wrote, which the page only passes on. The command line's block is the server's, shown as it came.
import { Address, AnyChainId, Nonce, Proof } from "@gnoworld/schemas";
import { jsonOf } from "@gnoworld/core";
import { z } from "../jitless.ts";
import { jsonCall, TIMEOUT_MS, type Fetcher, type Result } from "./http.ts";
import { pageFetch } from "../query/policy.ts";

export { type Fetcher, type Result } from "./http.ts";

/** The most the server reads of a pasted file, in bytes (server/src/login/linkRoutes.ts). */
export const FILE_MAX_BYTES = 4096;

const Signed = z.object({ signatures: z.array(z.unknown()).check(z.length(1)) });

/** Whether a pasted text could be the tool's signed file: at most 4 KiB, one JSON object with exactly one signature. Checked before a code is spent. */
export function fileShape(text: string): boolean {
  if (new TextEncoder().encode(text).length > FILE_MAX_BYTES) return false;
  const value = jsonOf(text);
  return typeof value === "object" && value !== null && Signed.safeParse(value).success;
}

const Kind = z.enum(["adena", "cli"]);
const Members = z.object({ members: z.array(Address).check(z.maxLength(10)) });
const Listed = z.object({
  members: z
    .array(z.object({ address: Address, kind: Kind, linkedAt: z.number().check(z.int(), z.nonnegative()) }))
    .check(z.maxLength(10)),
  worlds: z.array(z.string().check(z.minLength(1), z.maxLength(128))).check(z.maxLength(1000)),
  linked: z.boolean(),
});
export type LinkList = z.infer<typeof Listed>;
// The Adena code: the text to sign, and the chain the server checks the signature for, which Adena's network must be.
const AdenaChallenge = z.object({
  nonce: Nonce,
  text: z.string(),
  expiresAt: z.iso.datetime(),
  chainId: AnyChainId,
});
const Released = z.object({ ok: z.literal(true) });
const CliChallenge = z.object({
  nonce: Nonce,
  memo: z.string().check(z.maxLength(1024)),
  block: z.string().check(z.minLength(1), z.maxLength(8192)),
  expiresAt: z.iso.datetime(),
});
export type CliChallenge = z.infer<typeof CliChallenge>;

export function linksApi(fetcher: Fetcher, timeoutMs = TIMEOUT_MS) {
  const call = jsonCall(fetcher, timeoutMs);
  const refused = { ok: false, reason: "refused" } as const;
  // A verify's or an unlink's answer must be about the address asked: it is in the members, or (an unlink) it is not.
  const about = (
    result: Result<{ members: Address[] }>,
    address: Address,
    inside: boolean,
  ): Result<{ members: Address[] }> =>
    result.ok && result.value.members.includes(address) !== inside ? { ok: false, reason: "malformed" } : result;
  return {
    /** The identity of the logged-in address: its members, the worlds they own, whether this address is a link. */
    list: () => call({ path: "/api/links", schema: Listed }),
    /** A code for Adena to sign for the account `address`. */
    adenaChallenge: (address: Address) =>
      call({ path: "/api/links/challenge", body: { kind: "adena", address }, schema: AdenaChallenge }),
    /** A code and the block to copy for the command-line key of `address`. */
    cliChallenge: (address: Address) =>
      call({ path: "/api/links/challenge", body: { kind: "cli", address }, schema: CliChallenge }),
    /** Adena's signature of the code's text, as the account `address`. */
    verifyAdena: async (request: { nonce: string; address: Address; proof: Proof }) =>
      about(await call({ path: "/api/links/verify", body: request, schema: Members }), request.address, true),
    /** The file the command-line tool wrote, as it was pasted: at most 4 KiB, which the server reads. */
    verifyFile: async (request: { nonce: string; address: Address; file: string }) =>
      new TextEncoder().encode(request.file).length > FILE_MAX_BYTES
        ? refused
        : about(await call({ path: "/api/links/verify", body: request, schema: Members }), request.address, true),
    /** A code and the block to copy to release a command-line key: no session, the same proof as a link's. */
    releaseChallenge: (address: Address) =>
      call({ path: "/api/links/release/challenge", body: { address }, schema: CliChallenge }),
    /** The file the tool wrote for the release; the answer never says whether the key was linked. */
    releaseVerify: async (request: { nonce: string; address: Address; file: string }) =>
      new TextEncoder().encode(request.file).length > FILE_MAX_BYTES
        ? refused
        : call({ path: "/api/links/release/verify", body: request, schema: Released }),
    /** Takes `address` out of the identity; the members that are left. */
    unlink: async (address: Address) =>
      about(await call({ path: "/api/links/unlink", body: { address }, schema: Members }), address, false),
  };
}

/** The links' client of this page, on its own fetch. */
export const pageLinksApi = () => linksApi(pageFetch);
