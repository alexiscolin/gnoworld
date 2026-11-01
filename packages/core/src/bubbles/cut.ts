// The text of a bubble: plain text, cut by grapheme (docs/plans/slice-6.md §1 and §3). A control or format character
// (Cc, Cf: bidi marks, zero-width and tag characters), a lone surrogate and a joiner that joins nothing are removed; a
// line break or a tab becomes a space; a cluster over CLUSTER_UNITS is dropped whole. The relay takes 4096 bytes a line and
// a UTF-16 unit is at least a byte, so a head of as many units holds any line: a megabyte costs what the head costs.
import { firstGraphemes } from "../markdown/graphemes.ts";

const JOINER = "‍";
/** The relay's `MULTILINE_BYTES` (a test holds them equal): the import would split the module off the chat's chunk, for each world's first screen. */
const LINE_UNITS = 4096;
/** The longest cluster that stays, in UTF-16 units (a family of four with skin tones is 19): a bubble is never longer
 * than its cap times this. */
const CLUSTER_UNITS = 32;
const LOOSE =
  /(?<![\p{Extended_Pictographic}\u{FE0F}\p{Emoji_Modifier}])\u{200D}|\u{200D}(?!\p{Extended_Pictographic})/gu;

function strip(raw: string): string {
  return raw
    .replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu, (c) => (c === "\t" || c === "\n" || c === "\r" ? " " : c === JOINER ? c : ""))
    .replace(LOOSE, "");
}

/** The first `max` graphemes of `text`, cleaned; a cluster over the limit is skipped and does not count. */
export function cutText(text: string, max: number): string {
  const head = text.slice(0, max + 1);
  // Printable ASCII is one grapheme a character and nothing to clean: the usual chat line needs no segmenter.
  if (/^[\x20-\x7e]*$/.test(head)) return head.slice(0, max);
  const clean = strip(text.slice(0, LINE_UNITS));
  const kept = firstGraphemes(clean, clean.length).filter((cluster) => cluster.length <= CLUSTER_UNITS);
  return kept.slice(0, max).join("");
}
