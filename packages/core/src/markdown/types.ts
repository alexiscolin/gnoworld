// The tree a message reads into (slice 4's 4c): the nodes a renderer draws, and nothing else. A link's address is
// a plain https one, never inside another link; no text is empty, and no two sit side by side.

/** What a line holds: text, its marks, code, links, and the breaks between a paragraph's lines. */
export type Inline =
  | { type: "text"; text: string }
  | { type: "strong" | "em" | "strike"; children: Inline[] }
  | { type: "code"; text: string }
  | { type: "link"; href: string; children: Inline[] }
  | { type: "break" };

/** What a message holds: paragraphs, fenced code, quotes, and flat lists of one line an item. */
export type Block =
  | { type: "paragraph"; children: Inline[] }
  | { type: "codeBlock"; text: string }
  | { type: "quote"; children: Block[] }
  | { type: "list"; ordered: false; items: Inline[][] }
  | { type: "list"; ordered: true; start: number; items: Inline[][] };
