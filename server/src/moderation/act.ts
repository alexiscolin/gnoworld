// What the bot does with a verdict (ADR-0002 §6; slice 3's plan, 3j): a hidden line is redacted by the id
// Ergo gave the line just scored, and its author is told why in plain words, with the rules. Every word
// sent comes from this file, never from the message or the provider's answer.
import type { Said } from "../irc/link.ts";
import type { Category } from "./provider.ts";
import type { RuleReason } from "./rules.ts";
import type { Verdict } from "./check.ts";

export const REASON_WORDS: Readonly<Record<Category | RuleReason, string>> = {
  harassment: "harassment",
  "harassment/threatening": "threats",
  hate: "hate",
  "hate/threatening": "threats of hate",
  illicit: "advice on wrongdoing",
  "illicit/violent": "advice on violence",
  "self-harm": "self harm",
  "self-harm/instructions": "advice on self harm",
  "self-harm/intent": "self harm",
  sexual: "sexual content",
  "sexual/minors": "sexual content involving minors",
  violence: "violence",
  "violence/graphic": "graphic violence",
  banned_word: "a word this world bans",
  links: "too many links",
  mentions: "too many mentions",
  new_account_links: "too many links for a new account",
  too_fast: "too many messages too fast",
  not_their_edit: "an edit of a message that is not yours",
};

const RULES = "https://gno.world/rules";

/** Whether the verdict is carried out: a hide is, once its REDACT is sent; the NOTICE is a courtesy. */
export function act(
  { room, account, msgid }: Said,
  verdict: Verdict,
  { send }: { send: (command: "REDACT" | "NOTICE", params: readonly string[]) => boolean },
): boolean {
  if (verdict.action !== "hide") return true;
  const words = REASON_WORDS[verdict.reason];
  if (!send("REDACT", [room, msgid, words])) return false;
  send("NOTICE", [account, `Your message in ${room} was hidden: ${words}. The rules: ${RULES}`]);
  return true;
}
