// The tags each page carries: a title, a description and one canonical address on the site's
// origin, with their Open Graph and Twitter twins and a JSON-LD of the page; a page with no address of its
// own, and every page of a testnet, is not indexed.
import type { MetaDescriptor } from "react-router";
import type { Ecosystem, UniverseView, World } from "./places.ts";

export const ORIGIN = "https://gno.world";

const HUB = "gno.world, the social, on-chain hub of gno.land";

/** A universe's cosmos: the home for the default one, its own page for another. */
export function homeMeta(universe: UniverseView): MetaDescriptor[] {
  return pageMeta({
    title: universe.isDefault ? "gno.world" : `${universe.name} · gno.world`,
    description: universe.isDefault
      ? `${HUB}, where its worlds, their rooms and their realms meet.`
      : `The worlds of ${universe.name} on ${HUB}.`,
    path: universe.home.canonical,
    testnet: universe.testnet,
  });
}

/** A universe's Earth: its worlds and its ecosystems. */
export function earthMeta(universe: UniverseView): MetaDescriptor[] {
  return pageMeta({
    title: universe.isDefault ? "Earth · gno.world" : `Earth of ${universe.name} · gno.world`,
    description: `The Earth of ${universe.name}: the worlds and the ecosystems of this universe, on ${HUB}.`,
    path: universe.earth.canonical,
    testnet: universe.testnet,
  });
}

/** An ecosystem's tags, or, with none, a not-found page's. */
export function ecosystemMeta(ecosystem: Ecosystem | undefined): MetaDescriptor[] {
  if (!ecosystem) return unindexed("No ecosystem here");
  return pageMeta({
    title: `${ecosystem.name} · gno.world`,
    description: ecosystem.description.slice(0, 160),
    path: ecosystem.canonical,
    testnet: ecosystem.testnet,
  });
}

/** The list of places lives at /list in every universe: it has no place of its own in the data. */
export function listMeta(): MetaDescriptor[] {
  return pageMeta({
    title: "Places · gno.world",
    description: `Every place of ${HUB}, to filter by genre.`,
    path: "/list",
    testnet: false,
  });
}

/** A universe's page that no universe answers to. */
export function missingUniverseMeta(): MetaDescriptor[] {
  return unindexed("No universe here");
}

/** A world's tags, or, with no world, a not-found page's. */
export function worldMeta(world: World | undefined): MetaDescriptor[] {
  if (!world) return unindexed("No world here");
  return pageMeta({
    title: `${world.name} · gno.world`,
    description: world.description,
    path: world.canonical,
    testnet: world.testnet,
  });
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

function pageMeta(page: { title: string; description: string; path: string; testnet: boolean }): MetaDescriptor[] {
  const url = ORIGIN + page.path;
  return [
    { title: page.title },
    { name: "description", content: page.description },
    ...(page.testnet ? [{ name: "robots", content: "noindex" }] : []),
    { tagName: "link", rel: "canonical", href: url },
    { property: "og:title", content: page.title },
    { property: "og:description", content: page.description },
    { property: "og:url", content: url },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: page.title },
    { name: "twitter:description", content: page.description },
    // React Router writes it as a script of type application/ld+json, its text escaped (< > & U+2028), so a description is only text.
    {
      "script:ld+json": {
        "@context": "https://schema.org",
        "@type": "WebPage",
        url,
        name: page.title.replace(/ · gno\.world$/, ""),
        description: page.description,
      },
    },
  ];
}

/** A page that failed to load for another reason than its name. */
export function failedPageMeta(): MetaDescriptor[] {
  return unindexed("This page could not load");
}
