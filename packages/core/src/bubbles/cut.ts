// The text of a bubble: plain text, cut by grapheme (docs/plans/slice-6.md §1 and §3). A control or format character
// (Cc, Cf: bidi marks, zero-width and tag characters), a lone surrogate and a joiner that joins nothing are removed; a
// line break or a tab becomes a space; a cluster over CLUSTER_UNITS is dropped whole. The text is read a window at a
// time, so a megabyte costs what its first kilobyte does, unless it is all hidden.
const SEGMENTER = new Intl.Segmenter();
const JOINER = "\u200d";
const WINDOW = 1024;
/** The longest cluster that stays, in UTF-16 units (a family of four with skin tones is 19): a bubble is never longer
 * than its cap times this. */
const CLUSTER_UNITS = 32;

interface Reading {
  readonly max: number;
  readonly kept: string[];
  /** The last cluster of the window before, which the next one may go on; one over the limit is kept to its first
   * CLUSTER_UNITS + 1 units, so the next window re-reads it as a cluster over the limit and finds where it really ends (F3367). */
  pending: string;
  /** A joiner at a window's end, whose emoji may open the next one. */
  carry: string;
}

function strip(raw: string): string {
  return raw.replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu, (c) =>
    c === "\t" || c === "\n" || c === "\r" ? " " : c === JOINER ? c : "",
  );
}

/** The end of the window from `from`, never between the halves of a surrogate pair. */
function windowEnd(text: string, from: number): number {
  const end = Math.min(from + WINDOW, text.length);
  const before = text.charCodeAt(end - 1);
  const after = text.charCodeAt(end);
  return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff ? end - 1 : end;
}

function keep(reading: Reading, cluster: string): void {
  if (cluster.length <= CLUSTER_UNITS && reading.kept.length < reading.max) reading.kept.push(cluster);
}

/** The first code points of a cluster over the limit, enough to be over it still and never half a surrogate pair. */
function prefix(cluster: string): string {
  let head = "";
  for (const point of cluster) {
    if (head.length > CLUSTER_UNITS) break;
    head += point;
  }
  return head;
}

function take(reading: Reading, raw: string, last: boolean): void {
  let piece = reading.carry + raw;
  reading.carry = "";
  if (!last && piece.endsWith(JOINER)) {
    reading.carry = JOINER;
    piece = piece.slice(0, -1);
  }
  const loose =
    /(?<![\p{Extended_Pictographic}\u{FE0F}\p{Emoji_Modifier}])\u{200D}|\u{200D}(?!\p{Extended_Pictographic})/gu;
  const clusters = Array.from(SEGMENTER.segment((reading.pending + piece).replace(loose, "")), (s) => s.segment);
  reading.pending = last ? "" : (clusters.pop() ?? "");
  for (const cluster of clusters) keep(reading, cluster);
  if (reading.pending.length > CLUSTER_UNITS) reading.pending = prefix(reading.pending);
}

/** The first `max` graphemes of `text`, cleaned; a cluster over the limit is skipped and does not count. */
export function cutText(text: string, max: number): string {
  const head = text.slice(0, max + 1);
  // Printable ASCII is one grapheme a character and nothing to clean: the usual chat line needs no segmenter.
  if (/^[\x20-\x7e]*$/.test(head)) return head.slice(0, max);
  const reading: Reading = { max, kept: [], pending: "", carry: "" };
  let from = 0;
  while (from < text.length && reading.kept.length < max) {
    const to = windowEnd(text, from);
    take(reading, strip(text.slice(from, to)), to === text.length);
    from = to;
  }
  return reading.kept.join("");
}
