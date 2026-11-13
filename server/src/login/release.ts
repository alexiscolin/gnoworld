// The release of a command-line key (D13940, M2): a key linked by phishing has no session to unlink with, so it signs a code, offline,
// and the server drops its row. The code is stateless: 6 bytes of expiry and 10 of an HMAC (a key derived from the server's secret for
// this use alone) over the key, the host and the expiry. Asking writes nothing, so no flood can evict a code; a verified release is
// spent in a row of its own, kept until the code would have expired. The answers never tell whether the key was linked.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { Address, type Challenge } from "@gnoworld/schemas";
import { transaction } from "@gnoworld/service/db";
import { z } from "zod";
import { cliSafe } from "./cliProof.ts";
import { verifies, type Expected } from "./login.ts";

export const RELEASE_SPENT = `
CREATE TABLE release_spent (code TEXT PRIMARY KEY, expires_at INTEGER NOT NULL) STRICT;
CREATE INDEX release_spent_by_expiry ON release_spent (expires_at);
`;

const TTL_MS = 10 * 60_000;

export interface ReleaseOptions {
  now: () => number;
  chainId: string;
  cli: (file: string, expected: Expected) => Promise<boolean>;
  /** The server's secret: a key for the codes is derived from it, the secret itself never used raw. */
  secret: string;
  /** Drops the address's row (and its identity when one member is left), true if it had one. */
  drop: (address: Address) => boolean;
}

export interface Release {
  startRelease: (request: { subject: Address; host: string }) => Challenge | "text";
  finishRelease: (request: {
    nonce: string;
    address: Address;
    file: string;
    host: string;
  }) => Promise<"released" | "none" | "nonce" | "proof">;
}

const Row = z.object({ identity: z.string() });

// One member leaves its identity: an identity of one is no link, so its row goes with the last link. `dropRow` is the release's way.
export function droppers(db: DatabaseSync, membersOf: (identity: string) => Address[]) {
  const sql = {
    row: db.prepare("SELECT identity FROM links WHERE address = ?"),
    dropLink: db.prepare("DELETE FROM links WHERE address = ?"),
    dropLinks: db.prepare("DELETE FROM links WHERE identity = ?"),
    dropIdentity: db.prepare("DELETE FROM identities WHERE id = ?"),
  };
  const dropFrom = (identity: string, address: Address): Address[] => {
    sql.dropLink.run(address);
    const left = membersOf(identity);
    if (left.length < 2) {
      sql.dropLinks.run(identity);
      sql.dropIdentity.run(identity);
    }
    return left;
  };
  const dropRow = (address: Address): boolean =>
    transaction(db, () => {
      const row = sql.row.get(address);
      if (row === undefined) return false;
      dropFrom(Row.parse(row).identity, address);
      return true;
    });
  return { dropFrom, dropRow };
}

const textOf = (subject: string, host: string, code: string): string =>
  `Unlink ${subject} from its gnoworld identity on ${host}. Code ${code}`;

export function makeRelease(db: DatabaseSync, { now, chainId, cli, secret, drop }: ReleaseOptions): Release {
  const key = createHmac("sha256", secret).update("gnoworld release code v1").digest();
  const macOf = (subject: string, host: string, expiry: number): Buffer =>
    createHmac("sha256", key)
      .update(`release\n${subject}\n${host}\n${String(expiry)}`)
      .digest()
      .subarray(0, 10);
  const sql = {
    purge: db.prepare("DELETE FROM release_spent WHERE expires_at <= ?"),
    spend: db.prepare("INSERT OR IGNORE INTO release_spent (code, expires_at) VALUES (?, ?)"),
  };
  return {
    startRelease({ subject, host }) {
      const expiry = now() + TTL_MS;
      const bytes = randomBytes(16);
      bytes.writeUIntBE(expiry, 0, 6);
      macOf(subject, host, expiry).copy(bytes, 6);
      const nonce = bytes.toString("base64url");
      const text = textOf(subject, host, nonce);
      // The command line signs the text as a memo in JSON the chain re-encodes: only text both encode the same way.
      if (!cliSafe(text)) return "text";
      return { nonce, text, expiresAt: new Date(expiry).toISOString() };
    },

    async finishRelease({ nonce, address, file, host }) {
      const bytes = Buffer.from(nonce, "base64url");
      // Only the canonical spelling of 16 bytes: a code with a bit changed in the last character's spare bits is no code.
      if (bytes.length !== 16 || bytes.toString("base64url") !== nonce) return "nonce";
      const expiry = bytes.readUIntBE(0, 6);
      if (expiry <= now() || !timingSafeEqual(macOf(address, host, expiry), bytes.subarray(6))) return "nonce";
      const expected = { signer: address, chainId, data: textOf(address, host, nonce) };
      if (!(await verifies(cli, file, expected))) return "proof";
      // No await from here: the code is spent by its own insert, so of two finishes at once one releases.
      sql.purge.run(now());
      if (sql.spend.run(nonce, expiry).changes === 0) return "nonce";
      return drop(address) ? "released" : "none";
    },
  };
}
