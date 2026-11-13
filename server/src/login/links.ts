// Linked accounts (owners' moderation, part 2): one identity of up to ten addresses, each proven by its own signature.
// A code is the login's nonce with a kind of its own, spent by one statement before the first await; a link grants
// moderation of worlds and nothing else.
import { randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { Address, type Challenge, type Proof } from "@gnoworld/schemas";
import { transaction } from "@gnoworld/service/db";
import { z } from "zod";
import { cliSafe } from "./cliProof.ts";
import { verifyProof, verifies, type Expected, type Verify } from "./login.ts";
import { droppers, makeRelease, type Release } from "./release.ts";

export const LINK_TABLES = `
CREATE TABLE identities (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL) STRICT;
CREATE TABLE links (
  address TEXT PRIMARY KEY,
  identity TEXT NOT NULL REFERENCES identities (id),
  kind TEXT NOT NULL CHECK (kind IN ('adena', 'cli')),
  linked_at INTEGER NOT NULL
) STRICT;
CREATE INDEX links_by_identity ON links (identity);
`;

export type LinkKind = "adena" | "cli";
// What the account proves with: Adena's signature, or the file the command-line tool wrote.
type LinkProof = { kind: "adena"; proof: Proof } | { kind: "cli"; file: string };
export interface Verifiers {
  adena: Verify;
  cli: (file: string, expected: Expected) => Promise<boolean>;
}

interface Fresh {
  signedAt: number | undefined;
}
export interface Links extends Release {
  startLink: (
    request: Fresh & { by: Address; kind: LinkKind; subject: Address; host: string },
  ) => Challenge | "stale" | "pending" | "members" | "full" | "self" | "text";
  // The code spent first, then the proof; the refusals about the address come only after it passes.
  finishLink: (
    request: Fresh & LinkProof & { nonce: string; by: Address; address: Address; host: string },
  ) => Promise<{ members: Address[] } | "stale" | "nonce" | "proof" | "linked" | "members">;
  unlink: (request: Fresh & { by: Address; address: Address }) => { members: Address[] } | "stale" | "none";
  identityOf: (address: Address) => Address[];
  // The address's identity's members as a list shows them; none for an address with no link.
  list: (address: Address) => { address: Address; kind: LinkKind; linkedAt: number }[];
}

export interface LinkOptions {
  now: () => number;
  chainId: string;
  // The command line's verifier is part 3's: none given, it refuses.
  verifiers?: Partial<Verifiers>;
  linkCap?: number;
  // The server's secret, for the release codes' key.
  secret: string;
}

const Spent = z.object({ chain: z.string(), text: z.string() });
const Member = z.object({ address: Address, identity: z.string() });
const Count = z.object({ n: z.number() });
const Listed = z.object({ address: Address, kind: z.enum(["adena", "cli"]), linked_at: z.number() });
// The text B signs names every account the link joins: A's identity's other members, in the order the address sorts.
function linkText(who: {
  by: Address;
  subject: Address;
  others: Address[];
  host: string;
  chain: string;
  nonce: string;
}) {
  const { by, subject, others, host, chain, nonce } = who;
  const joined =
    others.length === 0
      ? ""
      : `, joining ${[others.slice(0, -1).join(", "), others.at(-1)].filter(Boolean).join(" and ")}`;
  const grant =
    others.length === 0
      ? "each of them moderates the rooms of every world the other owns"
      : "each of these accounts moderates the rooms of every world any of them owns";
  return `Link ${subject} to ${by} on ${host}${joined}. From now on ${grant} on ${chain}. Nothing else is granted. Code ${nonce}`;
}

/** How long after its signature a session may link and unlink (10 minutes). */
export const FRESH_MS = 10 * 60_000;
// The verifier of a kind nobody gave: it refuses.
// A link code's host is kept as `link:<host>`: the login's statement before the kinds, which binds a bare host, never matches it.
const stored = (host: string): string => `link:${host}`;
const none = () => Promise.resolve(false);
const [fresh, ttl, pendingPerAccount, seats] = [FRESH_MS, 10 * 60_000, 5, 10];

function statements(db: DatabaseSync) {
  return {
    purge: db.prepare("DELETE FROM nonces WHERE expires_at <= ?"),
    pending: db.prepare("SELECT count(*) AS n FROM nonces WHERE owner = ? AND kind IS NOT NULL"),
    pendingAll: db.prepare("SELECT count(*) AS n FROM nonces WHERE kind IS NOT NULL"),
    add: db.prepare(
      "INSERT INTO nonces (nonce, chain, host, text, owner, subject, kind, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ),
    spend: db.prepare(
      `DELETE FROM nonces WHERE nonce = ? AND kind = ? AND owner = ? AND subject = ? AND host = ? AND expires_at > ?
        RETURNING chain, text`,
    ),
    row: db.prepare("SELECT address, identity FROM links WHERE address = ?"),
    members: db.prepare("SELECT address, identity FROM links WHERE identity = ? ORDER BY address"),
    addIdentity: db.prepare("INSERT INTO identities (id, created_at) VALUES (?, ?)"),
    // The cap lives in the inserting statement: two inserts at once cannot both take the last seat.
    addLink: db.prepare(
      `INSERT INTO links (address, identity, kind, linked_at) SELECT ?, ?, ?, ?
        WHERE (SELECT count(*) FROM links WHERE identity = ?) < ${String(seats)}`,
    ),
    listing: db.prepare(
      "SELECT address, kind, linked_at FROM links WHERE identity = (SELECT identity FROM links WHERE address = ?) ORDER BY address",
    ),
  };
}

export function makeLinks(db: DatabaseSync, { now, chainId, verifiers, linkCap = 20_000, secret }: LinkOptions): Links {
  const verifier: Partial<Verifiers> = { adena: verifyProof, ...verifiers };
  const sql = statements(db);
  const isFresh = (signedAt: number | undefined): signedAt is number =>
    signedAt !== undefined && now() - signedAt <= fresh;
  const count = (row: unknown): number => Count.parse(row).n;
  const membersOf = (identity: string): Address[] => sql.members.all(identity).map((row) => Member.parse(row).address);
  const identityOf = (address: Address): Address[] => {
    const row = sql.row.get(address);
    return row === undefined ? [address] : membersOf(Member.parse(row).identity);
  };

  const others = (by: Address, subject: Address): Address[] =>
    identityOf(by).filter((member) => member !== by && member !== subject);
  const { dropFrom, dropRow } = droppers(db, membersOf);
  const release = makeRelease(db, { now, chainId, cli: verifier.cli ?? none, secret, drop: dropRow });
  return {
    identityOf,
    ...release,
    list: (address) =>
      sql.listing.all(address).map((row) => {
        const { linked_at: linkedAt, ...member } = Listed.parse(row);
        return { ...member, linkedAt };
      }),

    startLink({ by, kind, subject, host, signedAt }) {
      if (!isFresh(signedAt)) return "stale";
      if (by === subject) return "self";
      const at = now();
      sql.purge.run(at);
      if (count(sql.pending.get(by)) >= pendingPerAccount) return "pending";
      if (count(sql.pendingAll.get()) >= linkCap) return "full";
      if (identityOf(by).length >= seats) return "members";
      const nonce = randomBytes(16).toString("base64url");
      const text = linkText({ by, subject, others: others(by, subject), host, chain: chainId, nonce });
      // The command line signs the text as a memo in JSON the chain re-encodes: only text both encode the same way.
      if (kind === "cli" && !cliSafe(text)) return "text";
      sql.add.run(nonce, chainId, stored(host), text, by, subject, kind, at + ttl);
      return { nonce, text, expiresAt: new Date(at + ttl).toISOString() };
    },

    async finishLink(request) {
      const { nonce, by, kind, address, host, signedAt } = request;
      if (!isFresh(signedAt)) return "stale";
      // Spent before the first await: a code buys one attempt, and the same proof twice at once one link.
      const spent = sql.spend.get(nonce, kind, by, address, stored(host), now());
      if (spent === undefined) return "nonce";
      const { chain, text } = Spent.parse(spent);
      const expected = { signer: address, chainId: chain, data: text };
      const passed =
        request.kind === "cli"
          ? await verifies(verifier.cli ?? none, request.file, expected)
          : await verifies(verifier.adena ?? none, request.proof, expected);
      if (!passed) return "proof";
      // The proof passed: the identities are read now, not at the start, and written in one transaction.
      return transaction(db, () => {
        if (sql.row.get(address) !== undefined) return "linked";
        // B signed for the accounts named when the code was issued: if A's identity has changed since, it joins nothing.
        if (linkText({ by, subject: address, others: others(by, address), host, chain, nonce }) !== text)
          return "nonce";
        const at = now();
        const mine = sql.row.get(by);
        const identity = mine === undefined ? randomUUID() : Member.parse(mine).identity;
        if (mine === undefined) {
          sql.addIdentity.run(identity, at);
          sql.addLink.run(by, identity, "adena", at, identity);
        }
        if (sql.addLink.run(address, identity, kind, at, identity).changes === 0) return "members";
        return { members: membersOf(identity) };
      });
    },

    unlink({ by, address, signedAt }) {
      if (!isFresh(signedAt)) return "stale";
      return transaction(db, () => {
        const [mine, theirs] = [sql.row.get(by), sql.row.get(address)];
        if (mine === undefined || theirs === undefined) return "none";
        const { identity } = Member.parse(mine);
        if (Member.parse(theirs).identity !== identity) return "none";
        return { members: dropFrom(identity, address) };
      });
    },
  };
}
