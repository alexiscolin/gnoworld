// Mentions (slice 4's 4d): where a line holds one, and the accounts a message's tree names. A mention is one the
// server counts (server/src/moderation/rules.ts, which folds a line with chat/fold.ts first): `@` after what folds
// to no letter, digit or `_`, then an account's address, g1 and 38 of bech32's characters, a word whole; its form
// alone, the checksum unread. None in code, nor in a link's label. So the per-message cap holds for each one shown.
import { ADDRESS_BODY } from "../chain/evalName.ts";
import { fold } from "../chat/fold.ts";
import { inlines } from "./nodes.ts";
import { before } from "./scan.ts";
import type { Block, Inline } from "./types.ts";

// What ends in a letter, a digit or `_`, its last character whole, or in one this engine's Unicode has not assigned,
// which the server's newer tables may know as a letter (F817). No character class before `$`: V8 14.6 (Chromium
// 156, Node 26) misses a letter past the BMP there (F816).
const WORDLY_END = /(?:\p{L}|\p{N}|_|\p{Cn})$/u;

/** The account a mention at `at` (an `@`) names, or none: none after what folds to a letter, a digit, `_` or nothing
 * (a mark or a format character, which the server drops, joining the `@` to what is before them). */
export function mentionAt(source: string, at: number): string | undefined {
  const prior = before(source, at);
  const folded = prior === undefined ? " " : fold(prior);
  if (folded === "" || WORDLY_END.test(folded)) return undefined;
  const mention = new RegExp(`@(${ADDRESS_BODY})(?![\\p{L}\\p{N}_])`, "uy");
  mention.lastIndex = at;
  return mention.exec(source)?.[1];
}

/** Each mention a plain text holds, as a room's line reads one: where its `@` stands, where it ends, and its account. */
export function mentionSpans(text: string): { at: number; end: number; account: string }[] {
  const found: { at: number; end: number; account: string }[] = [];
  for (let at = text.indexOf("@"); at >= 0; at = text.indexOf("@", at + 1)) {
    const account = mentionAt(text, at);
    if (account !== undefined) found.push({ at, end: at + 1 + account.length, account });
  }
  return found;
}

/** The accounts a message's tree mentions, each once, in the order first named. */
export function mentions(blocks: readonly Block[]): string[] {
  const found = new Set<string>();
  for (const node of inlines(blocks)) if (node.type === "mention") found.add(node.address);
  return [...found];
}

// `@room`, the one word a line may name a whole room by (4f-n): after what folds to no letter, a digit, `_` or nothing,
// before none, on the line as the server folds it (rules.ts counts `@\w+` the same way). `prior` is the folded text
// before each piece, the raw source's closing marks standing for code, labels and marks, which hold no letter.
const ROOM_MENTION = /@room(?![\p{L}\p{N}_\p{Cn}])/gu;

// Whether `text`, folded, holds an @room that counts after what came before it.
function roomInText(text: string, state: { prior: string }, counts: boolean): boolean {
  const folded = fold(text);
  const found = [...folded.matchAll(ROOM_MENTION)].some(({ index }) => {
    const prior = state.prior + folded.slice(0, index);
    const last = prior === "" ? undefined : before(prior, prior.length);
    return last === undefined || !WORDLY_END.test(last);
  });
  state.prior += folded;
  return counts && found;
}

function visit(node: Inline, state: { prior: string }, counts: boolean): boolean {
  if (node.type === "text") return roomInText(node.text, state, counts);
  if ("children" in node) {
    // A link's label names no room; a mark's text does.
    const found = roomIn(node.children, state, counts && node.type !== "link");
    state.prior += node.type === "link" ? ")" : "*";
    return found;
  }
  // Code leaves its closing mark, a mention its words, a break a new start.
  if (node.type === "break") state.prior = "";
  else state.prior += node.type === "mention" ? `@${node.address}` : "`";
  return false;
}

function roomIn(nodes: readonly Inline[], state: { prior: string }, counts: boolean): boolean {
  let found = false;
  for (const node of nodes) found = visit(node, state, counts) || found;
  return found;
}

/** Whether a message's tree names the whole room: `@room` in its text, in any case, outside code and a link's label. */
export function mentionsRoom(blocks: readonly Block[]): boolean {
  const lines = (nodes: readonly Inline[]) => roomIn(nodes, { prior: "" }, true);
  return blocks.some((block) => {
    if (block.type === "quote") return mentionsRoom(block.children);
    if (block.type === "list") return block.items.some(lines);
    return block.type === "paragraph" && lines(block.children);
  });
}
