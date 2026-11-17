// The single-use nonces a wallet's signature spends (ADR-0002 §4, §6), a login's and an admin change's, each kept with the
// whole text signed; login.ts makes the session's token of a proved one.
import { randomBytes } from "node:crypto";
import type { DatabaseSync, StatementSync } from "node:sqlite";
import type { Challenge, VerifyRequest } from "@gnoworld/schemas";
import { z } from "zod";
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

export function makeSigned(
  db: DatabaseSync,
  { chains, now, verify = verifyProof, nonceCap = 100_000, console = false }: Options,
): Signed {
  if (chains.length === 0) throw new Error("the login needs at least one chain");
  const ttl = 5 * 60_000;
  const sql = {
    purgeNonces: db.prepare("DELETE FROM nonces WHERE expires_at <= ?"),
    countNonces: db.prepare("SELECT count(*) AS n FROM nonces WHERE kind IS NULL"),
    // ponytail: walks the table, n ≤ 2 × nonceCap (3.4 ms at 100,000); the console's calls are few, and
    // the public path keeps the global count, so a flood costs it nothing more.
    countHost: db.prepare("SELECT count(*) AS n FROM nonces WHERE host = ? AND kind IS NULL"),
    addNonce: db.prepare("INSERT INTO nonces (nonce, chain, host, text, action, expires_at) VALUES (?, ?, ?, ?, ?, ?)"),
    spendLogin: db.prepare(
      "DELETE FROM nonces WHERE nonce = ? AND host = ? AND expires_at > ? AND action IS NULL AND kind IS NULL RETURNING chain, text",
    ),
    spendAction: db.prepare(
      "DELETE FROM nonces WHERE nonce = ? AND host = ? AND expires_at > ? AND action IS NOT NULL AND kind IS NULL RETURNING chain, text, action",
    ),
  };
  // Spent before the first await: a nonce buys one attempt, and the same proof twice at once one success.
  const spendThenVerify = async <T extends z.infer<typeof Spent>>(
    [spend, Row]: [StatementSync, z.ZodType<T>],
    { nonce, address, proof }: VerifyRequest,
    host: string,
  ): Promise<T | "nonce" | "proof"> => {
    const spent = spend.get(nonce, host, now());
    if (spent === undefined) return "nonce";
    const row = Row.parse(spent);
    const valid = await verifies(verify, proof, { signer: address, chainId: row.chain, data: row.text });
    return valid ? row : "proof";
  };
  return {
    issue(chainId, host, { head, action }) {
      if (!chains.includes(chainId)) return "chain";
      const at = now();
      sql.purgeNonces.run(at);
      // ponytail: count(*) is O(n), n ≤ nonceCap (0.01 ms at 100,000); a counter kept with the rows if the cap rises.
      const pending = console ? sql.countHost.get(host) : sql.countNonces.get();
      if (Count.parse(pending).n >= nonceCap) return "full";
      const nonce = randomBytes(16).toString("base64url");
      const [issued, expiresAt] = [new Date(at).toISOString(), new Date(at + ttl).toISOString()];
      const text = [
        ...head,
        "",
        `Domain: ${host}`,
        `Nonce: ${nonce}`,
        `Issued: ${issued}`,
        `Expires: ${expiresAt}`,
      ].join("\n");
      sql.addNonce.run(nonce, chainId, host, text, action ?? null, at + ttl);
      return { nonce, text, expiresAt };
    },

    async prove(request, host) {
      const proved = await spendThenVerify([sql.spendLogin, Spent], request, host);
      return typeof proved === "string" ? proved : "proved";
    },

    async proveAction(request, host) {
      const proved = await spendThenVerify([sql.spendAction, SpentAction], request, host);
      return typeof proved === "string" ? proved : { action: proved.action };
    },
  };
}
