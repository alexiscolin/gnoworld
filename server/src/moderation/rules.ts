// A world's own rules, run before any provider (decision 159): banned words, links and mentions per
// message, and fewer links for a new account. Words compare as people read them, so a full-width or an
// accented spelling is the same word; a banned word matches whole, never inside a longer one.
import type { Rules } from "../roles/roles.ts";

export type RuleReason =
  "too_fast" | "not_their_edit" | "unknown_edit" | "banned_word" | "new_account_links" | "links" | "mentions";

// Compatibility forms to their plain letters, accents and invisible format characters dropped, lower case.
const fold = (text: string): string =>
  text
    .normalize("NFKD")
    .replace(/[\p{M}\p{Cf}]/gu, "")
    .toLowerCase();

// All the words in one pass over the line: a pass a word grew with both (the complexity review, F530). A
// word of a script written without spaces has no edge to find: it matches anywhere (F521).
function banned(folded: string, words: readonly string[]): boolean {
  const unspaced = /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Thai}\p{sc=Lao}\p{sc=Khmer}\p{sc=Myanmar}]/u;
  const plain = words
    .map((word) => fold(word).trim())
    // A word that folds to nothing would match everywhere.
    .filter((word) => word !== "");
  const escape = (list: string[]): string =>
    list.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")).join("|");
  const whole = plain.filter((word) => !unspaced.test(word));
  const inside = plain.filter((word) => unspaced.test(word));
  const patterns = [
    ...(whole.length > 0 ? [`(?:^|[^\\p{L}\\p{N}])(?:${escape(whole)})(?:$|[^\\p{L}\\p{N}])`] : []),
    ...(inside.length > 0 ? [escape(inside)] : []),
  ];
  return patterns.length > 0 && new RegExp(patterns.join("|"), "u").test(folded);
}

interface Flags {
  newAccount: boolean;
  tooFast?: boolean;
  foreignEdit?: boolean;
  // An edit of a line it never checked: hidden, its owner unknown, and no strike (F549).
  unknownEdit?: boolean;
}

// A line too fast, then an edit of a line not its author's (3k), before any rule of the world.
export function ruleVerdict(text: string, rules: Rules, flags: Flags): RuleReason | undefined {
  if (flags.tooFast === true) return "too_fast";
  if (flags.foreignEdit === true) return "not_their_edit";
  if (flags.unknownEdit === true) return "unknown_edit";
  return worldRule(text, rules, flags.newAccount);
}

function worldRule(text: string, rules: Rules, newAccount: boolean): RuleReason | undefined {
  const folded = fold(text);
  const links = folded.match(/\bhttps?:\/\/|(?<!\/\/)\bwww\./g)?.length ?? 0;
  const mentions = folded.match(/(?<![\p{L}\p{N}_])@\w+|\bg1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{38}\b/gu)?.length ?? 0;
  if (banned(folded, rules.bannedWords)) return "banned_word";
  if (newAccount && links > rules.linksForNewAccount) return "new_account_links";
  if (links > rules.linksPerMessage) return "links";
  if (mentions > rules.mentionsPerMessage) return "mentions";
  return undefined;
}
