// What a guest may say (plan 3.2, D430): stricter than an account, checked by the server before anything is relayed.
// A link is what the chat makes clickable, the account rules' own detector (https:// and www.); "discord.gg/x" is text.
import type { Rules } from "../roles/roles.ts";
import { ruleVerdict } from "../moderation/rules.ts";

export type GuestFault = "empty" | "control" | "multiline" | "too_long" | "banned_word" | "links" | "mentions";

export const GUEST_LINE_MAX = 280;
/** What the line may weigh: with the longest room and nick, RELAYMSG stays under the 510 bytes of an IRC line. */
export const GUEST_LINE_BYTES = 400;

/** A guest's rules in a room: the world's words and the default's, no link, one mention; none without either. */
export function guestRules(world: Rules | undefined, defaults: Rules | undefined): Rules | undefined {
  if (world === undefined && defaults === undefined) return undefined;
  const words = new Set([...(world?.bannedWords ?? []), ...(defaults?.bannedWords ?? [])]);
  return { bannedWords: [...words], linksPerMessage: 0, mentionsPerMessage: 1, linksForNewAccount: 0 };
}

// Line breaks first (a second line is its own fault), then every other control, DEL, the C1 controls and the
// bidirectional overrides that make a line read otherwise than it is written.
// Spaces, every format character (zero-width, marks, joiners, invisible operators), the Hangul filler and the braille blank.
const INVISIBLE = /[\s\p{Cf}\u3164\u2800]/gu;
const BREAKS = /[\n\r\u0085\u2028\u2029]/;
const CONTROLS = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/;

/** Why a line is refused, or nothing: its characters, its lines, its length, then the rules'. */
export function guestVerdict(text: string, rules: Rules): GuestFault | undefined {
  // A lone surrogate would break the line the bot writes; a line of nothing a reader sees is no line.
  if (!text.isWellFormed()) return "control";
  if (text.replace(INVISIBLE, "") === "") return "empty";
  if (BREAKS.test(text)) return "multiline";
  if (CONTROLS.test(text)) return "control";
  if (Array.from(text).length > GUEST_LINE_MAX || Buffer.byteLength(text) > GUEST_LINE_BYTES) return "too_long";
  const reason = ruleVerdict(text, rules, { newAccount: true });
  if (reason === undefined) return undefined;
  // The flags give no other reason: every other one is a link's.
  return reason === "banned_word" || reason === "mentions" ? reason : "links";
}
