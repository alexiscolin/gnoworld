// A world's own rules, run before any provider (decision 159): banned words, links and mentions per
// message, and fewer links for a new account. Words compare as people read them, so a full-width or an
// accented spelling is the same word; a banned word matches whole, never inside a longer one.
import type { Rules } from "../roles/roles.ts";

export type RuleReason = "banned_word" | "new_account_links" | "links" | "mentions";

// Compatibility forms to their plain letters, accents and invisible format characters dropped, lower case.
const fold = (text: string): string =>
  text
    .normalize("NFKD")
    .replace(/[\p{M}\p{Cf}]/gu, "")
    .toLowerCase();

function banned(folded: string, words: readonly string[]): boolean {
  return words.some((word) => {
    const plain = fold(word).trim();
    // A word that folds to nothing would match everywhere.
    if (plain === "") return false;
    const escaped = plain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`, "u").test(folded);
  });
}

export function ruleVerdict(
  text: string,
  rules: Rules,
  { newAccount }: { newAccount: boolean },
): RuleReason | undefined {
  const folded = fold(text);
  const links = folded.match(/\bhttps?:\/\/\S+|\bwww\.\S+/g)?.length ?? 0;
  const mentions = folded.match(/(?:^|\s)@\w+|\bg1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{38}\b/g)?.length ?? 0;
  if (banned(folded, rules.bannedWords)) return "banned_word";
  if (newAccount && links > rules.linksForNewAccount) return "new_account_links";
  if (links > rules.linksPerMessage) return "links";
  if (mentions > rules.mentionsPerMessage) return "mentions";
  return undefined;
}
