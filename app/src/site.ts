// The site's one origin, and the places slice 1 pre-renders: slice 5's data files replace the list.
import type { MetaDescriptor } from "react-router";

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

/** The world a path names, or undefined when none has that name. */
export function worldBySlug(slug: string | undefined): World | undefined {
  return WORLDS.find((world) => world.slug === slug);
}

/** A page's tags: its title, its description and its one canonical address, with their Open Graph twins. */
export function pageMeta(page: { title: string; description: string; path: string }): MetaDescriptor[] {
  const url = new URL(page.path, ORIGIN).href;
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
