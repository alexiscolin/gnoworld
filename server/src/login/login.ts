// The login (ADR-0002 §4): the server writes the whole text that a wallet signs and keeps it with a
// single-use nonce. Each verified proof produces one token, and only the token's SHA-256 is stored.
// A token renews on use for 30 days, and it ends 90 days after its login however often it is used.
import { createHash, randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { Address, type Challenge, type VerifyRequest } from "@gnoworld/schemas";
import { z } from "zod";
import { makeSigned, type CliLogin, type Options } from "./signed.ts";

export { makeSigned, type Signed } from "./signed.ts";

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

// The host a challenge was written for. This is a separate migration so that an existing database file can
// take it, and the column has a default so that an older image can still write a nonce without a host.
export const NONCE_HOST = `
ALTER TABLE nonces ADD COLUMN host TEXT NOT NULL DEFAULT '';
`;

// The change an admin signs with a nonce (ADR-0002 §6). A login's nonce has none. A login can only spend a
// nonce that has no action, and an admin change can only spend a nonce with its own action, so neither
// signature can be used in place of the other.
export const NONCE_ACTION = `
ALTER TABLE nonces ADD COLUMN action TEXT;
`;

// The columns for a link's code. The kind says how the link is proved, and it is NULL for a login's nonce and
// an admin change's nonce. The owner is the account that asked, and the subject is the address to link.
// The two spends above accept only a NULL kind, so one kind of code can never be used as another.
export const NONCE_LINK = `
ALTER TABLE nonces ADD COLUMN kind TEXT CHECK (kind IN ('adena', 'cli'));
ALTER TABLE nonces ADD COLUMN owner TEXT;
ALTER TABLE nonces ADD COLUMN subject TEXT;
CREATE INDEX nonces_by_owner ON nonces (owner) WHERE kind IS NOT NULL;
`;

export interface Login {
  challenge: (chainId: string, domain: string) => Challenge | "chain" | "full";
  verify: (
    request: VerifyRequest,
    mayCreate: () => boolean,
    // The host the proof comes from. It must be the host the challenge was written for, or the nonce does not match.
    host: string,
  ) => Promise<{ token: string; maxAge: number } | "nonce" | "proof" | "new_account">;
  // The command-line login works the same way, but its proof is a file signed by the address's key.
  cliChallenge: (address: Address, domain: string) => Challenge | "full" | "text";
  cliVerify: (request: CliLogin, mayCreate: () => boolean, host: string) => ReturnType<Login["verify"]>;
  session: (token: string | undefined) => Address | undefined;
  // When a live session's token was signed, in ms. It is undefined for no token, an ended token or an unknown token.
  signedAt: (token: string | undefined) => number | undefined;
  logout: (token: string | undefined) => void;
  // Ends every other token of a live session's address and keeps this one. An unknown, ended or absent token ends nothing.
  logoutOthers: (token: string | undefined) => void;
}

const Live = z.object({ address: Address, signed_at: z.number(), expires_at: z.number() });
const sha256 = (token: string): Buffer => createHash("sha256").update(token).digest();

export function makeLogin(db: DatabaseSync, options: Options): Login {
  const { now } = options;
  const signed = makeSigned(db, options);
  const day = 24 * 60 * 60_000;
  // The console's session ends an hour after its signature, however often it is used.
  const [sliding, cap] = options.console === true ? [60 * 60_000, 60 * 60_000] : [30 * day, 90 * day];
  const tokensPerAccount = 10;
  const sql = {
    known: db.prepare("SELECT 1 FROM accounts WHERE address = ?"),
    addAccount: db.prepare("INSERT INTO accounts (address, first_seen) VALUES (?, ?)"),
    purgeTokens: db.prepare("DELETE FROM tokens WHERE expires_at <= ?"),
    addToken: db.prepare("INSERT INTO tokens (hash, address, signed_at, expires_at) VALUES (?, ?, ?, ?)"),
    live: db.prepare("SELECT address, signed_at, expires_at FROM tokens WHERE hash = ? AND expires_at > ?"),
    renew: db.prepare("UPDATE tokens SET expires_at = ? WHERE hash = ?"),
    end: db.prepare("DELETE FROM tokens WHERE hash = ?"),
    // One statement deletes every other token of the live token's address and keeps the token's own hash.
    endOthers: db.prepare(
      "DELETE FROM tokens WHERE hash != ?1 AND address = (SELECT address FROM tokens WHERE hash = ?1 AND expires_at > ?2 AND signed_at + ?3 > ?2)",
    ),
    // An account keeps only its newest tokens, because logins that nobody uses would otherwise fill the disk.
    dropOldTokens: db.prepare(
      `DELETE FROM tokens WHERE address = ? AND rowid NOT IN
        (SELECT rowid FROM tokens WHERE address = ? ORDER BY signed_at DESC, rowid DESC LIMIT ?)`,
    ),
  };

  // Returns a token for a proved address. If the address is new, this first creates its account, provided the limit allows it.
  const admit = (address: Address, mayCreate: () => boolean): { token: string; maxAge: number } | "new_account" => {
    const at = now();
    if (sql.known.get(address) === undefined) {
      if (!mayCreate()) return "new_account";
      sql.addAccount.run(address, at);
    }
    sql.purgeTokens.run(at);
    const token = randomBytes(32).toString("base64url");
    sql.addToken.run(sha256(token), address, at, at + sliding);
    sql.dropOldTokens.run(address, address, tokensPerAccount);
    return { token, maxAge: cap / 1000 };
  };

  return {
    challenge: (chainId, domain) =>
      signed.issue(chainId, domain, {
        head: ["Sign in to gnoworld (login, version 2)", `Sign only if your browser's address bar shows ${domain}.`],
      }),

    async verify(request, mayCreate, host) {
      const proved = await signed.prove(request, host);
      return proved === "proved" ? admit(request.address, mayCreate) : proved;
    },

    cliChallenge: (address, domain) => signed.issueCli(address, domain),

    async cliVerify(request, mayCreate, host) {
      const proved = await signed.proveCli(request, host);
      return proved === "proved" ? admit(request.address, mayCreate) : proved;
    },

    signedAt(token) {
      if (token === undefined) return undefined;
      const row = sql.live.get(sha256(token), now());
      return row === undefined ? undefined : Live.parse(row).signed_at;
    },

    session(token) {
      if (token === undefined) return undefined;
      const [at, hash] = [now(), sha256(token)];
      const row = sql.live.get(hash, at);
      if (row === undefined) return undefined;
      const { address, signed_at: signed, expires_at: expires } = Live.parse(row);
      // A token made by another kind of login may live longer, so the console refuses any token signed more than an hour ago.
      if (signed + cap <= at) return undefined;
      // Write at most once a minute per token, so a stream of uses (one ticket per reconnect) costs only one write.
      const renewed = Math.min(at + sliding, signed + cap);
      if (renewed - expires >= 60_000) sql.renew.run(renewed, hash);
      return address;
    },

    logout(token) {
      if (token !== undefined) sql.end.run(sha256(token));
    },

    logoutOthers(token) {
      if (token !== undefined) sql.endOthers.run(sha256(token), now(), cap);
    },
  };
}
