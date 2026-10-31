// A realm in the chat (5h): its page's first heading and first paragraph, cut short, the block height it was read at, and
// the link to the realm on gnoweb, which every card carries. A page the reader did not read (past the cap) shows the cap's
// state and the link, never a part of it. Plain text only: what a realm says of itself is its own words.
import { firstGraphemes, words, type Page, type PageBlock } from "@gnoworld/core";
import { createElement, type ReactNode } from "react";
import edge from "./frame.module.css";
import styles from "./RealmCard.module.css";

/** The graphemes of a heading and of a paragraph a card shows, at most: a page of one long word is a line, not a screen. */
export const CARD_HEADING = 80;
export const CARD_PARAGRAPH = 200;

export interface RealmCardProps {
  /** The realm's path, `/r/demo/dao`. */
  path: string;
  /** gnoweb's https origin, from the data. */
  gnoweb: string;
  /** The block height the page was read at. */
  height: number;
  page: Page;
}

// A text cut to `count` graphemes, an ellipsis when cut; spaces collapsed.
function cut(text: string, count: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const kept = firstGraphemes(flat, count + 1);
  return kept.length <= count ? flat : `${kept.slice(0, count - 1).join("")}…`;
}

const textOf = (block: PageBlock | undefined): string =>
  block?.type === "heading" || block?.type === "paragraph" ? words(block.children) : "";

// The realm's address on gnoweb: its path under gnoweb's own origin, or none if the path would lead off it.
function gnowebLink(gnoweb: string, path: string): string | undefined {
  try {
    const base = new URL(gnoweb);
    const link = new URL(path, base);
    return base.protocol === "https:" && link.origin === base.origin ? link.href : undefined;
  } catch {
    return undefined;
  }
}

function summary(page: Page): ReactNode[] {
  if (page.kind === "too-big") {
    return [
      createElement("p", { key: "big" }, `This page is too large to show here (over ${String(page.cap / 1024)} KB).`),
    ];
  }
  const heading = cut(textOf(page.blocks.find((block) => block.type === "heading")), CARD_HEADING);
  const paragraph = cut(textOf(page.blocks.find((block) => block.type === "paragraph")), CARD_PARAGRAPH);
  return [
    heading === "" ? undefined : createElement("h3", { key: "h" }, heading),
    paragraph === "" ? undefined : createElement("p", { key: "p" }, paragraph),
  ];
}

/** A realm's card: what its page opens with, where it was read, and the way to gnoweb. */
export function RealmCard({ path, gnoweb, height, page }: RealmCardProps) {
  const href = gnowebLink(gnoweb, path);
  return createElement(
    "article",
    { className: [edge["frame"], styles["card"]].join(" "), "data-block": "realm-card" },
    ...summary(page),
    createElement(
      "p",
      { className: styles["meta"] },
      href === undefined
        ? path
        : createElement("a", { href, target: "_blank", rel: "noopener noreferrer", dir: "ltr" }, path),
      ` · read at block ${new Intl.NumberFormat("en-US").format(height)}`,
    ),
  );
}
