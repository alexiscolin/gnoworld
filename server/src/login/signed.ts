// The single-use nonces a wallet's signature spends (ADR-0002 §4, §6), a login's and an admin change's, each kept with the
// whole text signed, and the command line's login's; login.ts makes the session's token of a proved one.
import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Address, Challenge, VerifyRequest } from "@gnoworld/schemas";
import { z } from "zod";
import { CLI_CHAIN, cliSafe, cliVerify } from "./cliProof.ts";
import { verifies, verifyProof, type Verify } from "./verify.ts";

/** A text signed once: a nonce kept with the whole text the wallet signs, and with the action it stands for when it is
 * an admin's change, then the proof that spends it. */
export interface Signed {
  // `head`'s lines, then the domain, the nonce and the times, for a chain the settings name; kept five minutes.
  issue: (
    chainId: string,
    host: string,
    text: { head: readonly string[]; action?: string },
  ) => Challenge | "chain" | "full";
  // A login's nonce spent first, by one statement, then the proof checked against the signer, the chain and the text.
  prove: (request: VerifyRequest, host: string) => Promise<"proved" | "nonce" | "proof">;
  // The same for a change's nonce, giving back its action once the proof passes.
  proveAction: (request: VerifyRequest, host: string) => Promise<{ action: string } | "nonce" | "proof">;
  // The command line's login: one line its tool signs as a memo, on the chain that exists nowhere, its nonce of kind cli
  // bound to the address; then the file that address's key signed.
  issueCli: (address: Address, host: string) => Challenge | "full" | "text";
  proveCli: (request: CliLogin, host: string) => Promise<"proved" | "nonce" | "proof">;
}

export interface CliLogin {
  nonce: string;
  address: Address;
  file: string;
}

const Spent = z.object({ chain: z.string(), text: z.string() });
const SpentAction = Spent.extend({ action: z.string() });
const Count = z.object({ n: z.number() });

export interface Options {
  chains: readonly string[];
  now: () => number;
  verify?: Verify;
  nonceCap?: number;
  // The admin console's login and changes (ADR-0002 §6): its own host's pending nonces counted alone, so a public flood
  // never fills its cap, and a session of one hour from its signature.
  console?: boolean;
}

const statements = (db: DatabaseSync) => ({
  purgeNonces: db.prepare("DELETE FROM nonces WHERE expires_at <= ?"),
  // Every nonce with no owner, the command line's login's with them: a link's code alone has one, and its own cap.
  countNonces: db.prepare("SELECT count(*) AS n FROM nonces WHERE owner IS NULL"),
  // ceiling: walks the table, n ≤ 2 × nonceCap (3.4 ms at 100,000); the console's calls are few, and
  // the public path keeps the global count, so a flood costs it nothing more.
  countHost: db.prepare("SELECT count(*) AS n FROM nonces WHERE host = ? AND kind IS NULL"),
  addNonce: db.prepare(
    "INSERT INTO nonces (nonce, chain, host, text, action, kind, subject, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ),
  spendLogin: db.prepare(
    "DELETE FROM nonces WHERE nonce = ? AND host = ? AND expires_at > ? AND action IS NULL AND kind IS NULL RETURNING chain, text",
  ),
  spendAction: db.prepare(
    "DELETE FROM nonces WHERE nonce = ? AND host = ? AND expires_at > ? AND action IS NOT NULL AND kind IS NULL RETURNING chain, text, action",
  ),
  // A link's code has an owner and a `link:` host: neither ever matches here.
  spendCli: db.prepare(
    `DELETE FROM nonces WHERE nonce = ? AND host = ? AND expires_at > ? AND subject = ? AND kind = 'cli' AND owner IS NULL
      AND action IS NULL RETURNING chain, text`,
  ),
});

export function makeSigned(
  db: DatabaseSync,
  { chains, now, verify = verifyProof, nonceCap = 100_000, console = false }: Options,
): Signed {
  if (chains.length === 0) throw new Error("the login needs at least one chain");
  const ttl = 5 * 60_000;
  const sql = statements(db);
  // The row a spend returned, taken by the caller before its first await (a nonce buys one attempt, and the same proof
  // twice at once one success), then its proof checked against the stored chain and text.
  const spendThenVerify = async <T extends z.infer<typeof Spent>>(
    spent: unknown,
    Row: z.ZodType<T>,
    proves: (expected: { chainId: string; data: string }) => Promise<boolean>,
  ): Promise<T | "nonce" | "proof"> => {
    if (spent === undefined) return "nonce";
    const row = Row.parse(spent);
    return (await proves({ chainId: row.chain, data: row.text })) ? row : "proof";
  };
  const byAdena =
    ({ address, proof }: VerifyRequest) =>
    (expected: { chainId: string; data: string }) =>
      verifies(verify, proof, { signer: address, ...expected });
  // A new nonce and its lines, the expired ones purged first, or full.
  const fresh = (host: string) => {
    const at = now();
    sql.purgeNonces.run(at);
    // ceiling: count(*) is O(n), n ≤ nonceCap (0.01 ms at 100,000); a counter kept with the rows if the cap rises.
    const pending = console ? sql.countHost.get(host) : sql.countNonces.get();
    if (Count.parse(pending).n >= nonceCap) return "full";
    const [nonce, expiresAt] = [randomBytes(16).toString("base64url"), new Date(at + ttl).toISOString()];
    const lines = [
      `Domain: ${host}`,
      `Nonce: ${nonce}`,
      `Issued: ${new Date(at).toISOString()}`,
      `Expires: ${expiresAt}`,
    ];
    return { nonce, expiresAt, lines, until: at + ttl };
  };
  return {
    issue(chainId, host, { head, action }) {
      if (!chains.includes(chainId)) return "chain";
      const made = fresh(host);
      if (made === "full") return made;
      const text = [...head, "", ...made.lines].join("\n");
      sql.addNonce.run(made.nonce, chainId, host, text, action ?? null, null, null, made.until);
      return { nonce: made.nonce, text, expiresAt: made.expiresAt };
    },

    issueCli(address, host) {
      const made = fresh(host);
      if (made === "full") return made;
      const head = `Sign in to gnoworld with gnokey (login, version 1). Sign only if your browser's address bar shows ${host}.`;
      const text = [head, ...made.lines].join(" ");
      // The tool signs the text as a memo in JSON the chain re-encodes: only text both encode the same way.
      if (!cliSafe(text)) return "text";
      sql.addNonce.run(made.nonce, CLI_CHAIN, host, text, null, "cli", address, made.until);
      return { nonce: made.nonce, text, expiresAt: made.expiresAt };
    },

    async prove(request, host) {
      const spent = sql.spendLogin.get(request.nonce, host, now());
      const proved = await spendThenVerify(spent, Spent, byAdena(request));
      return typeof proved === "string" ? proved : "proved";
    },

    async proveAction(request, host) {
      const spent = sql.spendAction.get(request.nonce, host, now());
      const proved = await spendThenVerify(spent, SpentAction, byAdena(request));
      return typeof proved === "string" ? proved : { action: proved.action };
    },

    async proveCli({ nonce, address, file }, host) {
      const spent = sql.spendCli.get(nonce, host, now(), address);
      const proved = await spendThenVerify(spent, Spent, (expected) =>
        verifies(cliVerify, file, { signer: address, ...expected }),
      );
      return typeof proved === "string" ? proved : "proved";
    },
  };
}
