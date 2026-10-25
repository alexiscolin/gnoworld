// Mentions (slice 4's 4d): where a line holds one, and the accounts a message's tree names. A mention is as the
// server counts one (server/src/moderation/rules.ts): `@` after no letter, digit or `_`, then an account's address,
// g1 and 38 of bech32's characters, a word whole; its form alone, the checksum unread. None in code, nor in a link's
// label, where the reader makes none.
import { inlines } from "./nodes.ts";
import { before } from "./scan.ts";
import type { Block } from "./types.ts";

const WORDLY = /[\p{L}\p{N}_]/u;
const MENTION = /@(g1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{38})(?![\p{L}\p{N}_])/uy;

/** The account a mention at `at` (an `@`) names, or none. */
export function mentionAt(source: string, at: number): string | undefined {
  if (WORDLY.test(before(source, at) ?? "")) return undefined;
  MENTION.lastIndex = at;
  return MENTION.exec(source)?.[1];
}

/** The accounts a message's tree mentions, each once, in the order first named. */
export function mentions(blocks: readonly Block[]): string[] {
  const found = new Set<string>();
  for (const node of inlines(blocks)) if (node.type === "mention") found.add(node.address);
  return [...found];
}
