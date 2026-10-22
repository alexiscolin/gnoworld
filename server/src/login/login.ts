// The login (ADR-0002 §4; slice 3's plan, 3c): the server writes the whole text a wallet signs and keeps
// it with a single-use nonce; one verified proof makes one token, of which only the SHA-256 is stored.
// The token renews on use for 30 days and ends 90 days after its login whatever the use (decision 143).
import { createHash, randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
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

interface Expected {
  signer: Address;
  chainId: string;
  data: string;
}
export type Verify = (proof: Proof, expected: Expected) => Promise<boolean>;

// The SDK's verifier says yes when told nothing to check (ADR-0002 §4): here all three are required.
export const verifyProof: Verify = async (proof, { signer, chainId, data }) =>
  verifyArbitrarySignature(proof, { signer, chainId, data });

export interface Login {
  challenge: (chainId: string, domain: string) => Challenge | "chain" | "full";
  verify: (
    request: VerifyRequest,
    mayCreate: () => boolean,
  ) => Promise<{ token: string; maxAge: number } | "nonce" | "proof" | "new_account">;
  session: (token: string | undefined) => Address | undefined;
  logout: (token: string | undefined) => void;
}

const Spent = z.object({ chain: z.string(), text: z.string() });
const Live = z.object({ address: Address, signed_at: z.number(), expires_at: z.number() });
const Count = z.object({ n: z.number() });
const sha256 = (token: string): Buffer => createHash("sha256").update(token).digest();

interface Options {
  chains: readonly string[];
  now: () => number;
  verify?: Verify;
  nonceCap?: number;
}

export function makeLogin(db: DatabaseSync, { chains, now, verify = verifyProof, nonceCap = 100_000 }: Options): Login {
  if (chains.length === 0) throw new Error("the login needs at least one chain");
  const ttl = 5 * 60_000;
  const day = 24 * 60 * 60_000;
  const [sliding, cap] = [30 * day, 90 * day];
  const tokensPerAccount = 10;
  const sql = {
    purgeNonces: db.prepare("DELETE FROM nonces WHERE expires_at <= ?"),
    countNonces: db.prepare("SELECT count(*) AS n FROM nonces"),
    addNonce: db.prepare("INSERT INTO nonces (nonce, chain, text, expires_at) VALUES (?, ?, ?, ?)"),
    spend: db.prepare("DELETE FROM nonces WHERE nonce = ? AND expires_at > ? RETURNING chain, text"),
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
    challenge(chainId, domain) {
      if (!chains.includes(chainId)) return "chain";
      const at = now();
      sql.purgeNonces.run(at);
      // ponytail: count(*) is O(n), n ≤ nonceCap (0.01 ms at 100,000); a counter kept with the rows if the cap rises.
      if (Count.parse(sql.countNonces.get()).n >= nonceCap) return "full";
      const nonce = randomBytes(16).toString("base64url");
      const [issued, expiresAt] = [new Date(at).toISOString(), new Date(at + ttl).toISOString()];
      const text = [
        "Sign in to gnoworld (login, version 1)",
        "",
        `Domain: ${domain}`,
        `Nonce: ${nonce}`,
        `Issued: ${issued}`,
        `Expires: ${expiresAt}`,
      ].join("\n");
      sql.addNonce.run(nonce, chainId, text, at + ttl);
      return { nonce, text, expiresAt };
    },

    async verify({ nonce, address, proof }, mayCreate) {
      // Spent before the first await: a nonce buys one attempt, and the same proof twice at once one login.
      const spent = sql.spend.get(nonce, now());
      if (spent === undefined) return "nonce";
      const { chain, text } = Spent.parse(spent);
      let valid = false;
      try {
        valid = await verify(proof, { signer: address, chainId: chain, data: text });
      } catch {
        // A verifier that fails refuses; the SDK's never throws, but the login must not depend on it.
      }
      if (!valid) return "proof";
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
