// The link a chat line's card is for (docs/plans/link-previews.md §3, §4): the page's own reading of the line, so the server and the
// page agree. The Markdown decides what a link is (https only, no userinfo, no look-alike letter, none in code); the first link decides.
import { isPublicOrigin } from "../chain/origin.ts";
import { markdown } from "../markdown/markdown.ts";
import type { Block, Inline } from "../markdown/markdown.ts";

const MAX_URL = 2048;

function inLinks(inlines: readonly Inline[]): string | undefined {
  for (const node of inlines) {
    if (node.type === "link") return node.href;
    if ("children" in node) {
      const found = inLinks(node.children);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function inBlocks(blocks: readonly Block[]): string | undefined {
  for (const block of blocks) {
    const found =
      block.type === "paragraph"
        ? inLinks(block.children)
        : block.type === "quote"
          ? inBlocks(block.children)
          : block.type === "list"
            ? inLinks(block.items.flat())
            : undefined;
    if (found !== undefined) return found;
  }
  return undefined;
}

/** The first link of the line, as the Markdown reads it, if a card may be made for it: https on port 443 or none, a public name,
 * at most 2,048 characters. None otherwise, and none for a later link when the first is refused. */
export function cardLinkOf(text: string): string | undefined {
  const href = inBlocks(markdown(text));
  if (href === undefined || href.length > MAX_URL) return undefined;
  const [, host = "", port] = /^https:\/\/([^/?#:]*)(?::(\d*))?/.exec(href) ?? [];
  return (port === undefined || port === "443") && isPublicOrigin(`https://${host.toLowerCase()}`) ? href : undefined;
}

/** The link as the cache keys it: scheme and host in lower case, no fragment, no default port, a path of at least a slash. The Markdown
 * already refused anything but `https://host[:port]` followed by a path, a query or a fragment. */
export function normalisedUrl(url: string): string {
  const [, host = "", port = "", rest = ""] = /^https:\/\/([^/?#:]*)(?::(\d*))?([^#]*)/i.exec(url) ?? [];
  const path = rest.startsWith("/") ? rest : `/${rest}`;
  return `https://${host.toLowerCase()}${port === "" || port === "443" ? "" : `:${port}`}${path}`;
}
