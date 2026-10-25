// Mentions (slice 4's 4d): where a line holds one, and the accounts a message's tree names. A mention is one the
// server counts (server/src/moderation/rules.ts, which folds a line with chat/fold.ts first): `@` after what folds
// to no letter, digit or `_`, then an account's address, g1 and 38 of bech32's characters, a word whole; its form
// alone, the checksum unread. None in code, nor in a link's label. So the per-message cap holds for each one shown.
import { fold } from "../chat/fold.ts";
import { inlines } from "./nodes.ts";
import { before } from "./scan.ts";
import type { Block } from "./types.ts";

// What ends in a letter, a digit or `_`, its last character whole.
const WORDLY_END = /[\p{L}\p{N}_]$/u;
const MENTION = /@(g1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{38})(?![\p{L}\p{N}_])/uy;

/** The account a mention at `at` (an `@`) names, or none: none after what folds to a letter, a digit, `_` or nothing
 * (a mark or a format character, which the server drops, joining the `@` to what is before them). */
export function mentionAt(source: string, at: number): string | undefined {
  const prior = before(source, at);
  const folded = prior === undefined ? " " : fold(prior);
  if (folded === "" || WORDLY_END.test(folded)) return undefined;
  MENTION.lastIndex = at;
  return MENTION.exec(source)?.[1];
}

/** The accounts a message's tree mentions, each once, in the order first named. */
export function mentions(blocks: readonly Block[]): string[] {
  const found = new Set<string>();
  for (const node of inlines(blocks)) if (node.type === "mention") found.add(node.address);
  return [...found];
}
