// The site's one origin, the places slice 1 pre-renders (slice 5's data files replace the list),
// and the tags each page carries.
import { data, type MetaDescriptor } from "react-router";

const ORIGIN = "https://gno.world";

export interface World {
  slug: string;
  name: string;
  description: string;
}

export const WORLDS: readonly World[] = [
  {
    slug: "bubble",
    name: "Bubble",
    description:
      "Bubble, a world of gno.land: the BUBBLE token, its governance, and the games played with it on chain.",
  },
];

/** The world a path names; throws React Router's 404 when none has that name. */
export function findWorld(slug: string | undefined): World {
  const world = WORLDS.find((each) => each.slug === slug);
  if (!world) throw data(null, { status: 404 });
  return world;
}

/** A world's one address on the site: its links, its pre-rendered page and its canonical. */
export function worldPath(world: World): string {
  return `/w/${world.slug}`;
}

export function homeMeta(): MetaDescriptor[] {
  return pageMeta({
    title: "gno.world",
    description:
      "gno.world: the social, on-chain hub of gno.land, where its worlds, their rooms and their realms meet.",
    path: "/",
  });
}

/** A world's tags, or, with no world, a not-found page's: no address of its own, not indexed. */
export function worldMeta(world: World | undefined): MetaDescriptor[] {
  if (!world) return unindexed("No world here");
  return pageMeta({ title: `${world.name} · gno.world`, description: world.description, path: worldPath(world) });
}

/** A world that failed to load for another reason than its name: said so, and not indexed. */
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

// A page's title, description and one canonical address, with their Open Graph twins.
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
