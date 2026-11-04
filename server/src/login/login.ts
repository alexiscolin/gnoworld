// The login (ADR-0002 §4; slice 3's plan, 3c): the server writes the whole text a wallet signs and keeps
// it with a single-use nonce; one verified proof makes one token, of which only the SHA-256 is stored.
// The token renews on use for 30 days and ends 90 days after its login whatever the use (decision 143).
import { createHash, randomBytes } from "node:crypto";
import type { DatabaseSync, StatementSync } from "node:sqlite";
import { verifyArbitrarySignature } from "@adena-wallet/sdk";
import { Address, type Challenge, type Proof, type VerifyRequest } from "@gnoworld/schemas";
import { z } from "zod";

export const LOGIN_TABLES = `
CREATE TABLE nonces (nonce TEXT PRIMARY KEY, chain TEXT NOT NULL, text TEXT NOT NULL, expires_at INTEGER NOT NULL) STRICT;
CREATE INDEX nonces_by_expiry ON nonces (expires_at);
CREATE TABLE accounts (address TEXT PRIMARY KEY, first_seen INTEGER NOT NULL) STRICT;
CREATE TABLE tokens (
  hash BLOB PRIMARY KEY,
  address TEXT NOT NULL REFERENCES accounts (address),
  signed_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
) STRICT;
CREATE INDEX tokens_by_expiry ON tokens (expires_at);
CREATE INDEX tokens_by_address ON tokens (address, signed_at);
`;

// The host a challenge was written for (F427), added after 3c's file: a migration of its own, so a file
// made before takes it, and with a default, so the image before still writes a nonce (no host's).
export const NONCE_HOST = `
ALTER TABLE nonces ADD COLUMN host TEXT NOT NULL DEFAULT '';
`;

// The change an admin signs with a nonce (10g, ADR-0002 §6), none for a login's: a login spends a nonce with none alone,
// a change one with its own, so neither signature ever stands for the other (Alexis, 10g-3).
export const NONCE_ACTION = `
ALTER TABLE nonces ADD COLUMN action TEXT;
`;

interface Expected {
  signer: Address;
  chainId: string;
  data: string;
}
export type Verify = (proof: Proof, expected: Expected) => Promise<boolean>;

// The SDK's verifier says yes when told nothing to check (ADR-0002 §4): here all three are required.
export const verifyProof: Verify = async (proof, { signer, chainId, data }) =>
  verifyArbitrarySignature(proof, { signer, chainId, data });

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

export interface Login {
  challenge: (chainId: string, domain: string) => Challenge | "chain" | "full";
  verify: (
    request: VerifyRequest,
    mayCreate: () => boolean,
    // The host the proof comes from: its challenge's own, or the nonce is not this one's (F427).
    host: string,
  ) => Promise<{ token: string; maxAge: number } | "nonce" | "proof" | "new_account">;
  session: (token: string | undefined) => Address | undefined;
  logout: (token: string | undefined) => void;
}

const Spent = z.object({ chain: z.string(), text: z.string() });
const SpentAction = Spent.extend({ action: z.string() });
const Live = z.object({ address: Address, signed_at: z.number(), expires_at: z.number() });
const Count = z.object({ n: z.number() });
const sha256 = (token: string): Buffer => createHash("sha256").update(token).digest();

interface Options {
  chains: readonly string[];
  now: () => number;
  verify?: Verify;
  nonceCap?: number;
  // The admin console's login and changes (ADR-0002 §6): its own host's pending nonces counted alone, so a public flood
  // never fills its cap (Alexis, 10g-6).
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
    countNonces: db.prepare("SELECT count(*) AS n FROM nonces"),
    // ponytail: walks the table, n ≤ 2 × nonceCap (3.4 ms at 100,000, measured by the finding-verifier); the console's
    // calls are few, and the public path keeps the global count, so a flood costs it nothing more (Alexis, 10g-6).
    countHost: db.prepare("SELECT count(*) AS n FROM nonces WHERE host = ?"),
    addNonce: db.prepare("INSERT INTO nonces (nonce, chain, host, text, action, expires_at) VALUES (?, ?, ?, ?, ?, ?)"),
    spendLogin: db.prepare(
      "DELETE FROM nonces WHERE nonce = ? AND host = ? AND expires_at > ? AND action IS NULL RETURNING chain, text",
    ),
    spendAction: db.prepare(
      "DELETE FROM nonces WHERE nonce = ? AND host = ? AND expires_at > ? AND action IS NOT NULL RETURNING chain, text, action",
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
    let valid = false;
    try {
      valid = await verify(proof, { signer: address, chainId: row.chain, data: row.text });
    } catch {
      // A verifier that fails refuses; the SDK's never throws, but the login must not depend on it.
    }
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

export function makeLogin(db: DatabaseSync, options: Options): Login {
  const { now } = options;
  const signed = makeSigned(db, options);
  const day = 24 * 60 * 60_000;
  const [sliding, cap] = [30 * day, 90 * day];
  const tokensPerAccount = 10;
  const sql = {
    known: db.prepare("SELECT 1 FROM accounts WHERE address = ?"),
    addAccount: db.prepare("INSERT INTO accounts (address, first_seen) VALUES (?, ?)"),
    purgeTokens: db.prepare("DELETE FROM tokens WHERE expires_at <= ?"),
    addToken: db.prepare("INSERT INTO tokens (hash, address, signed_at, expires_at) VALUES (?, ?, ?, ?)"),
    live: db.prepare("SELECT address, signed_at, expires_at FROM tokens WHERE hash = ? AND expires_at > ?"),
    renew: db.prepare("UPDATE tokens SET expires_at = ? WHERE hash = ?"),
    end: db.prepare("DELETE FROM tokens WHERE hash = ?"),
    // An account keeps its newest tokens only: logins nobody uses would otherwise fill the disk (F435).
    keepNewest: db.prepare(
      `DELETE FROM tokens WHERE address = ? AND rowid NOT IN
        (SELECT rowid FROM tokens WHERE address = ? ORDER BY signed_at DESC, rowid DESC LIMIT ?)`,
    ),
  };

  return {
    challenge: (chainId, domain) => signed.issue(chainId, domain, { head: ["Sign in to gnoworld (login, version 1)"] }),

    async verify(request, mayCreate, host) {
      const proved = await signed.prove(request, host);
      if (proved !== "proved") return proved;
      const { address } = request;
      const at = now();
      if (sql.known.get(address) === undefined) {
        if (!mayCreate()) return "new_account";
        sql.addAccount.run(address, at);
      }
      sql.purgeTokens.run(at);
      const token = randomBytes(32).toString("base64url");
      sql.addToken.run(sha256(token), address, at, at + sliding);
      sql.keepNewest.run(address, address, tokensPerAccount);
      return { token, maxAge: cap / 1000 };
    },

    session(token) {
      if (token === undefined) return undefined;
      const [at, hash] = [now(), sha256(token)];
      const row = sql.live.get(hash, at);
      if (row === undefined) return undefined;
      const { address, signed_at: signed, expires_at: expires } = Live.parse(row);
      // One write a minute at most per token: a stream of uses, a ticket per reconnect, costs one.
      const renewed = Math.min(at + sliding, signed + cap);
      if (renewed - expires >= 60_000) sql.renew.run(renewed, hash);
      return address;
    },

    logout(token) {
      if (token !== undefined) sql.end.run(sha256(token));
    },
  };
}
