// A realm in the chat (5h): its page's first heading and first paragraph, cut short, the block height it was read at, and
// the link to the realm on gnoweb, which every card carries. A page the reader did not read (past the cap) shows the cap's
// state and the link, never a part of it. Plain text only: what a realm says of itself is its own words. The design
// system's compact Card, and gnoweb's address from lib/chain.
import { cutGraphemes, words, type Page, type PageBlock } from "@gnoworld/core";
import { Card } from "@gnoworld/ui";
import { gnowebLink } from "../../lib/chain/gnoweb.ts";

/** The graphemes of a heading and of a paragraph a card shows, at most: a page of one long word is a line, not a screen. */
export const CARD_HEADING = 80;
export const CARD_PARAGRAPH = 200;

export interface RealmCardProps {
  /** The realm's path, `/r/demo/dao`. */
  path: string;
  /** gnoweb's https origin (the universe's `gnoweb` in the data). */
  gnoweb: string;
  /** The block height the page was read at. */
  height: number;
  page: Page;
}

const textOf = (block: PageBlock | undefined): string =>
  block?.type === "heading" || block?.type === "paragraph" ? words(block.children) : "";

const flat = (text: string): string => text.replace(/\s+/g, " ").trim();

/** What a card says of a page's size: the cap's state. */
export const bigLine = (cap: number): string => `This page is too large to show here (over ${String(cap / 1024)} KB).`;

/** A realm's card: what its page opens with, where it was read, and the way to gnoweb. */
export function RealmCard({ path, gnoweb, height, page }: RealmCardProps) {
  const href = gnowebLink(gnoweb, path);
  const heading =
    page.kind === "page" ? cutGraphemes(flat(textOf(page.blocks.find((b) => b.type === "heading"))), CARD_HEADING) : "";
  const paragraph =
    page.kind === "page"
      ? cutGraphemes(flat(textOf(page.blocks.find((b) => b.type === "paragraph"))), CARD_PARAGRAPH)
      : "";
  return (
    <Card compact>
      <Card.Header title={heading === "" ? path : heading} kicker="Realm" />
      <Card.Body>
        {page.kind === "too-big" ? <p>{bigLine(page.cap)}</p> : paragraph === "" ? null : <p>{paragraph}</p>}
        <small>
          {href === undefined ? (
            path
          ) : (
            <a href={href} target="_blank" rel="noopener noreferrer" dir="ltr">
              {path}
            </a>
          )}
          {` · read at block ${new Intl.NumberFormat("en-US").format(height)}`}
        </small>
      </Card.Body>
    </Card>
  );
}
