// A text's head in graphemes, apart from plain.ts: what the first screen cuts a quoted line to must not bring the Markdown
// reader with it (the bundler keeps a module whole; ADR-0001 §12, docs/decisions.md, 2026-10-28).
const SEGMENTER = new Intl.Segmenter();
const graphemes = (text: string): string[] => Array.from(SEGMENTER.segment(text), ({ segment }) => segment);

/** The first `count` graphemes of `text` (a skin tone, a ZWJ family or a flag is one). Only a head of eight units a
 * grapheme is segmented, the text being up to 4096 bytes and a quote needing a few dozen graphemes of it (F1723); a
 * head that holds no more than `count` graphemes, a cluster of them perhaps cut, is read from the whole text. */
export function firstGraphemes(text: string, count: number): string[] {
  const head = text.slice(0, count * 8);
  const found = graphemes(head);
  return head.length === text.length || found.length > count ? found.slice(0, count) : graphemes(text).slice(0, count);
}
