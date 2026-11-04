// The tree a message reads into (slice 4's 4c): the nodes a renderer draws, and nothing else. A link's address is
// a plain https one, never inside another link; a mention's (4d) an account's, never inside a link either; no text
// is empty, and no two sit side by side.

/** What a line holds: text, its marks (the chat's underline among them, 8k), code, links, mentions, and the breaks
 * between a paragraph's lines. */
export type Inline =
  | { type: "text"; text: string }
  | { type: "strong" | "em" | "strike" | "underline"; children: Inline[] }
  | { type: "code"; text: string }
  | { type: "link"; href: string; children: Inline[] }
  | { type: "mention"; address: string }
  | { type: "break" };

/** What a message holds: paragraphs, fenced code, quotes, and flat lists of one line an item. */
export type Block =
  | { type: "paragraph"; children: Inline[] }
  | { type: "codeBlock"; text: string }
  | { type: "quote"; children: Block[] }
  | { type: "list"; ordered: false; items: Inline[][] }
  | { type: "list"; ordered: true; start: number; items: Inline[][] };

/** A tree of blocks that may also hold `Extra` ones, a page's headings and forms (page.ts), in quotes too. Chat's `Block`
 * is `Tree<never>`: the reader is one, the dialect only adds blocks. */
export type Tree<Extra> = Exclude<Block, { type: "quote" }> | { type: "quote"; children: Tree<Extra>[] } | Extra;
