// The tags each page carries: a title, a description and one canonical address on the site's
// origin, with their Open Graph twins; a page with no address of its own is not indexed.
import type { MetaDescriptor } from "react-router";
import { worldPath, type World } from "./worlds.ts";

const ORIGIN = "https://gno.world";

export function homeMeta(): MetaDescriptor[] {
  return pageMeta({
    title: "gno.world",
    description:
      "gno.world: the social, on-chain hub of gno.land, where its worlds, their rooms and their realms meet.",
    path: "/",
  });
}

/** A world's tags, or, with no world, a not-found page's. */
export function worldMeta(world: World | undefined): MetaDescriptor[] {
  if (!world) return unindexed("No world here");
  return pageMeta({ title: `${world.name} · gno.world`, description: world.description, path: worldPath(world) });
}

/** A world that failed to load for another reason than its name. */
export function failedWorldMeta(): MetaDescriptor[] {
  return unindexed("This world could not load");
}

/** A path no route matches. */
export function notFoundMeta(): MetaDescriptor[] {
  return unindexed("No page here");
}

function unindexed(title: string): MetaDescriptor[] {
  return [{ title: `${title} · gno.world` }, { name: "robots", content: "noindex" }];
}

function pageMeta(page: { title: string; description: string; path: string }): MetaDescriptor[] {
  const url = ORIGIN + page.path;
  return [
    { title: page.title },
    { name: "description", content: page.description },
    { tagName: "link", rel: "canonical", href: url },
    { property: "og:title", content: page.title },
    { property: "og:description", content: page.description },
    { property: "og:url", content: url },
    { property: "og:type", content: "website" },
  ];
}
