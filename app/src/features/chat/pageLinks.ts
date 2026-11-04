// A line's link to a page that has a capture (8f), read as embeds.ts reads a player's: a realm's home on the default universe's gnoweb,
// exactly, and nothing else. The page never asks the address a line holds: the previews feature looks it up in the site's own file.
import { inlines, type Block } from "@gnoworld/core";
import { RealmPath } from "@gnoworld/schemas/indexer";

/** The realm whose home `href` is on `gnoweb`'s https origin, exactly: no user, no query, no fragment, no sub-page nor source. */
export function capturedPath(href: string, gnoweb: string): string | undefined {
  if (!URL.canParse(href) || !URL.canParse(gnoweb)) return undefined;
  const url = new URL(href);
  const origin = new URL(gnoweb);
  if (origin.protocol !== "https:" || url.origin !== origin.origin) return undefined;
  if (url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") return undefined;
  const path = `gno.land${url.pathname.replace(/\/$/, "")}`;
  return RealmPath.safeParse(path).success ? path : undefined;
}

/** The realm of a line's first link to a page's home on `gnoweb`, or none. */
export function previewIn(blocks: readonly Block[], gnoweb: string): string | undefined {
  for (const node of inlines(blocks)) {
    if (node.type !== "link") continue;
    const path = capturedPath(node.href, gnoweb);
    if (path !== undefined) return path;
  }
  return undefined;
}
