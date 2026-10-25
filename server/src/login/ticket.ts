// The tickets that log a person into Ergo (slice 3's plan, 3d): 256 random bits minted for a session's
// account, of which only the SHA-256 is stored, good once and for 60 seconds. Ergo's auth script hands
// one back as the SASL passphrase; the account it names must be the ticket's, written canonically.
import { createHash, randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { Address } from "@gnoworld/schemas";
import { z } from "zod";

export const TICKET_TABLES = `
CREATE TABLE tickets (
  hash BLOB PRIMARY KEY,
  address TEXT NOT NULL REFERENCES accounts (address),
  expires_at INTEGER NOT NULL
) STRICT;
CREATE INDEX tickets_by_expiry ON tickets (expires_at);
`;

export interface Tickets {
  mint: (address: Address) => string;
  redeem: (ticket: string, account: string) => Address | undefined;
}

export function makeTickets(db: DatabaseSync, { now }: { now: () => number }): Tickets {
  const ttl = 60_000;
  const Owner = z.object({ address: Address });
  const sha256 = (ticket: string): Buffer => createHash("sha256").update(ticket).digest();
  const sql = {
    purge: db.prepare("DELETE FROM tickets WHERE expires_at <= ?"),
    add: db.prepare("INSERT INTO tickets (hash, address, expires_at) VALUES (?, ?, ?)"),
    spend: db.prepare("DELETE FROM tickets WHERE hash = ? AND expires_at > ? RETURNING address"),
  };
  return {
    mint(address) {
      const at = now();
      sql.purge.run(at);
      const ticket = randomBytes(32).toString("base64url");
      sql.add.run(sha256(ticket), address, at + ttl);
      return ticket;
    },
    redeem(ticket, account) {
      // A name that is not an address's one spelling never reaches the table.
      const named = Address.safeParse(account);
      if (!named.success) return undefined;
      const row = sql.spend.get(sha256(ticket), now());
      if (row === undefined) return undefined;
      const { address } = Owner.parse(row);
      return address === named.data ? address : undefined;
    },
  };
}
