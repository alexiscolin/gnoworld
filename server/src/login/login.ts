// The login (ADR-0002 §4): the server writes the whole text a wallet signs and keeps
// it with a single-use nonce; one verified proof makes one token, of which only the SHA-256 is stored.
// The token renews on use for 30 days and ends 90 days after its login whatever the use.
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

// The host a challenge was written for: a migration of its own, so an existing file takes it, and with a
// default, so an older image still writes a nonce (no host's).
export const NONCE_HOST = `
ALTER TABLE nonces ADD COLUMN host TEXT NOT NULL DEFAULT '';
`;

// The change an admin signs with a nonce (ADR-0002 §6), none for a login's: a login spends a nonce with none alone,
// a change one with its own, so neither signature ever stands for the other.
export const NONCE_ACTION = `
ALTER TABLE nonces ADD COLUMN action TEXT;
`;

// A link's code: its kind is the way it is proved, NULL for a login's and an admin change's,
// the account that asked and the address to link. The two spends above take NULL alone, so no code stands for another.
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
    // The host the proof comes from: its challenge's own, or the nonce is not this one's.
    host: string,
  ) => Promise<{ token: string; maxAge: number } | "nonce" | "proof" | "new_account">;
  // The command line's login: the same, its proof the file the address's key signed.
  cliChallenge: (address: Address, domain: string) => Challenge | "full" | "text";
  cliVerify: (request: CliLogin, mayCreate: () => boolean, host: string) => ReturnType<Login["verify"]>;
  session: (token: string | undefined) => Address | undefined;
  // When a live session's token was signed, in ms; undefined for none, an ended one or an unknown.
  signedAt: (token: string | undefined) => number | undefined;
  logout: (token: string | undefined) => void;
  // Ends every other token of a live session's address, this one kept; an unknown, ended or absent token ends nothing.
  logoutOthers: (token: string | undefined) => void;
}

const Live = z.object({ address: Address, signed_at: z.number(), expires_at: z.number() });
const sha256 = (token: string): Buffer => createHash("sha256").update(token).digest();

export function makeLogin(db: DatabaseSync, options: Options): Login {
  const { now } = options;
  const signed = makeSigned(db, options);
  const day = 24 * 60 * 60_000;
  // The console's session ends an hour after its signature, whatever the use.
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
    // One statement: every other token of the live token's address, the token's own hash kept.
    endOthers: db.prepare(
      "DELETE FROM tokens WHERE hash != ?1 AND address = (SELECT address FROM tokens WHERE hash = ?1 AND expires_at > ?2 AND signed_at + ?3 > ?2)",
    ),
    // An account keeps its newest tokens only: logins nobody uses would otherwise fill the disk.
    dropOldTokens: db.prepare(
      `DELETE FROM tokens WHERE address = ? AND rowid NOT IN
        (SELECT rowid FROM tokens WHERE address = ? ORDER BY signed_at DESC, rowid DESC LIMIT ?)`,
    ),
  };

  // A proved address's token, its account made first when it is new and the limit lets it.
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
      // A token another login made lives longer: the console takes none signed more than its hour ago.
      if (signed + cap <= at) return undefined;
      // One write a minute at most per token: a stream of uses, a ticket per reconnect, costs one.
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
