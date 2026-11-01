// A realm's page (5h): the Markdown that `vm/qrender` answers, read into the tree of blocks a page may draw, never HTML
// (ADR-0002 §4; docs/plans/slice-5-part-2.md §1). The chat's reader plus headings, and gnoweb's alerts, columns and forms
// degraded to blocks (pageGrammar.ts); an image is a link to it; a link to a path resolves against gnoweb's origin when
// given one, and is text without. A page past 256 KB is not read: its answer is the cap's state, never a part of the page
// shown as whole. Linear in the page's bytes (benched at 16, 64 and 256 KB).
import { Blocks } from "./blocks.ts";
import { originOf } from "./address.ts";
import { pageDialect, type PageBlock, type PageExtra } from "./pageGrammar.ts";

export type { FormField, PageBlock } from "./pageGrammar.ts";

/** The most bytes of a page that are read. */
export const PAGE_MAX_BYTES = 256 * 1024;

export type Page = { kind: "page"; blocks: PageBlock[] } | { kind: "too-big"; bytes: number; cap: number };

export interface PageOptions {
  /** gnoweb's https origin, which a link to a path (`/r/demo/dao:vote`) resolves against; none, or one that is not
   * `https://host[:port]`, leaves such a link as text. */
  origin?: string;
}

// The bytes `source` takes in UTF-8, as a TextEncoder counts them (a lone half of a pair is three).
function bytesOf(source: string): number {
  let bytes = 0;
  for (let at = 0; at < source.length; at += 1) {
    const unit = source.charCodeAt(at);
    const next = source.charCodeAt(at + 1);
    if (unit < 0x80) bytes += 1;
    else if (unit < 0x800) bytes += 2;
    else if (unit >= 0xd800 && unit < 0xdc00 && next >= 0xdc00 && next < 0xe000) {
      bytes += 4;
      at += 1;
    } else bytes += 3;
  }
  return bytes;
}

/** A realm page's Markdown, as its blocks, or the cap's state when it weighs more than 256 KB. */
export function page(source: string, options: PageOptions = {}): Page {
  // Three bytes a unit at most: a page this short is under the cap whatever it holds.
  const bytes = source.length * 3 <= PAGE_MAX_BYTES ? 0 : bytesOf(source);
  if (bytes > PAGE_MAX_BYTES) return { kind: "too-big", bytes, cap: PAGE_MAX_BYTES };
  const origin = options.origin === undefined ? undefined : originOf(options.origin);
  const lines = source.split(/\r\n|\r|\n/);
  const dialect = pageDialect({ images: true, origin });
  return { kind: "page", blocks: new Blocks<PageExtra>(lines, 0, dialect).read() };
}
