// The check before an explanation is kept: Jarvis's text is a model's reading of a stranger's code, so it is shown only when it is two
// sentences and 240 characters at most of plain text, with no link, no address, no amount of a coin, no claim of trust or reward, and no
// instruction to the reader to send, sign, approve, connect or share. What it strips (control, bidi and hidden characters) is gone before any
// rule reads it. A text that fails is refused for its first reason, which is logged; nothing of it shows.
import { EXPLAIN_CAPS } from "@gnoworld/schemas";

export type Checked = { ok: true; text: string } | { ok: false; reason: string };

// What a reader cannot see, or a terminal acts on, as jarvis's untrusted blocks name it.
const HIDDEN = /[\p{Default_Ignorable_Code_Point}\p{Cf}\p{Zl}\p{Zp}\p{Cc}]/gu;
const VERBS =
  "send|transfer|sign|approve|connect|share|enter|paste|reveal|provide|deposit|withdraw|claim|verify|authorize|import|visit|click|open|follow|join|buy|invest|call|use|try|run|pay|stake|mint|burn|go|submit";
const COIN = "u?gnot|atom|usdc?|usdt|eth|btc|dollars?|euros?";
const NUMBER = "one|two|three|four|five|six|seven|eight|nine|ten|twenty|fifty|hundred|thousand|million|half";
const rules: readonly (readonly [string, RegExp])[] = [
  ["markup", /[<>`[\]*#|\\{}_]|&[a-z#0-9]+;/i],
  ["link", /\b(?:https?|ftp|wss?|mailto|data|javascript):|www\.|\/\/|\b[a-z0-9-]+\.[a-z]{2,}\b/i],
  ["address", /\bg1[0-9a-z]{6,}|\bg1\s?[0-9a-z]{3,}\s[0-9a-z]{3,}|\b0x[0-9a-f]{6,}|@[a-z0-9_]/i],
  [
    "amount",
    new RegExp(
      `[$\u20ac\u00a3]\\s*\\d|\\d[\\d.,]*\\s*[km]?\\s*(?:${COIN}|coins?)\\b|\\b(?:${NUMBER})\\b\\W+(?:\\w+\\W+)?(?:${COIN})\\b|\\d+[km]\\b`,
      "i",
    ),
  ],
  ["wallet", /\b(?:wallet|seed|mnemonic|passphrase|private key|recovery phrase|secret phrase|password)\b/i],
  [
    "trust",
    /\b(?:safe|safely|secure|audited|trusted|official|verified|guaranteed|legit|risk-free|profit|profits|earn|airdrop|giveaway|bonus|rewards?)\b/i,
  ],
  ["gain", /\b(?:double|doubled|doubles|twice|free|win|wins|winning|jackpot|prize|prizes|multiply|passive)\b/i],
  // An instruction: a sentence that opens with one of the verbs, or is asked of the reader, or sends something somewhere.
  [
    "instruction",
    new RegExp(
      `(?:^|[.!?;]\\s+)(?:${VERBS})\\b|\\b(?:please|kindly|just|now|first|then|immediately|urgently|must|should)\\s+(?:${VERBS})\\b|\\byou\\s+(?:must|should|need to|have to|can now)\\b|\\b(?:send|transfer)\\s+(?:them|it|your|the|all|any|some|funds|\\d)`,
      "i",
    ),
  ],
];

// The sentences of a text: runs that end on a full stop, a question mark, an exclamation mark or a semicolon.
const sentencesOf = (text: string): number => text.split(/(?<=[.!?;])\s+/).filter((part) => /\p{L}/u.test(part)).length;

// Typographic marks a model writes in English, as plain ones: what is left outside printable ASCII is another script or a disguise.
const plain = (text: string): string =>
  text
    .normalize("NFKC")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...");

/** Whether `raw`, a model's text, may be kept and shown, and the text to keep: stripped, trimmed, its spaces folded. */
export function checkLine(raw: string): Checked {
  const text = plain(raw.replace(/\s+/g, " ").replace(HIDDEN, "")).trim();
  if (text === "") return { ok: false, reason: "empty" };
  if (/[^\x20-\x7e]/.test(text)) return { ok: false, reason: "script" };
  if (text.length > EXPLAIN_CAPS.chars) return { ok: false, reason: "long" };
  // A full stop with no space after it is still the end of a sentence: the rules read the text with one added too.
  const spaced = text.replace(/([.!?;])(?=\p{L})/gu, "$1 ");
  if (sentencesOf(spaced) > EXPLAIN_CAPS.sentences) return { ok: false, reason: "sentences" };
  for (const [reason, rule] of rules) if (rule.test(text) || rule.test(spaced)) return { ok: false, reason };
  return { ok: true, text };
}
