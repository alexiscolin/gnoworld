// The head of a page, read as data (docs/plans/link-previews.md §4, "Malicious text in og fields"): title, description, site and picture
// address from Open Graph (falling back to `<title>` and `name=description`), entities decoded once, Cc and Cf removed by the shared rule
// (packages/schemas/src/hidden.ts), the caps of CARD_CAPS; nothing from a `<script>`, a comment or past the head.

import { CARD_CAPS, stripHidden } from "@gnoworld/schemas";
import { Parser } from "htmlparser2";
import { readableUrl } from "./url.ts";

export interface Head {
  title: string;
  description: string;
  site: string;
  /** An address the URL rule accepts, resolved against the page's; undefined if none. */
  image: string | undefined;
}

const charsetIn = (text: string) => /charset\s*=\s*["']?([\w:.-]+)/i.exec(text)?.[1];

const bomOf = ([a, b, c]: Uint8Array) =>
  a === 0xef && b === 0xbb && c === 0xbf
    ? "utf-8"
    : a === 0xff && b === 0xfe
      ? "utf-16le"
      : a === 0xfe && b === 0xff
        ? "utf-16be"
        : undefined;
// A label that no BOM backs: UTF-16 and UTF-32 are UTF-8 (a declaration cannot be read in them).
const plainLabel = (label: string) => (/^utf-(16|32)/i.test(label) ? "utf-8" : label);

/** A page's bytes as text: the BOM, else the `Content-Type` charset, else a `<meta charset>` in the first 1,024 bytes, else UTF-8; an unknown
 * label is UTF-8 and so is a UTF-16 or UTF-32 one that no BOM backs; an invalid sequence is U+FFFD, never an error. */
export function decodeHtml(bytes: Uint8Array, contentType: string): string {
  const bom = bomOf(bytes);
  const declared =
    charsetIn(contentType) ?? charsetIn(Buffer.from(bytes.subarray(0, 1024)).toString("latin1")) ?? "utf-8";
  try {
    return new TextDecoder(bom ?? plainLabel(declared)).decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

// Whitespace to one space, hidden characters out (the shared rule), well formed, cut at the cap without splitting a character.
function clean(text: string, cap: number): string {
  const plain = stripHidden(text.replace(/[\p{Z}\t\n\v\f\r]+/gu, " "))
    .toWellFormed()
    .replaceAll("\ufffd", "")
    .trim();
  let out = "";
  for (const char of plain) {
    if (out.length + char.length > cap) break;
    out += char;
  }
  return out.trim();
}

/** The head's card fields, or undefined if the page has no title. */
export function parseHead(html: string, page: URL): Head | undefined {
  const meta = new Map<string, string>();
  let title = "";
  let inTitle = false;
  let skipping = 0;
  const parser = new Parser(
    {
      onopentag(name, attribs) {
        if (["noscript", "template"].includes(name)) skipping += 1;
        else if (name === "title") inTitle = title === "";
        else if (name === "meta" && skipping === 0) {
          const key = (attribs["property"] ?? attribs["name"] ?? "").toLowerCase();
          const content = attribs["content"] ?? "";
          if ((meta.get(key) ?? "").trim() === "") meta.set(key, content);
        }
      },
      ontext(text) {
        if (inTitle) title += text;
      },
      onclosetag(name) {
        if (["noscript", "template"].includes(name)) skipping = Math.max(0, skipping - 1);
        else if (name === "title") inTitle = false;
      },
    },
    { decodeEntities: true },
  );
  // The head only: what follows `</head>` or `<body` is the page's, which the parser never sees.
  const end = html.search(/<\/head\s*>|<body[\s>]/i);
  parser.write(end === -1 ? html : html.slice(0, end));
  parser.end();
  const text = (key: string, cap: number) => clean(meta.get(key) ?? "", cap);
  const found = text("og:title", CARD_CAPS.title) || clean(title, CARD_CAPS.title);
  if (found === "") return undefined;
  const image = (meta.get("og:image") ?? "").trim();
  return {
    title: found,
    description: text("og:description", CARD_CAPS.description) || text("description", CARD_CAPS.description),
    site: text("og:site_name", CARD_CAPS.site),
    image: image === "" ? undefined : readableUrl(URL.parse(image, page.href)?.href ?? "")?.href,
  };
}
