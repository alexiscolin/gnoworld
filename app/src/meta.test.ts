import type { MetaDescriptor } from "react-router";
import { describe, expect, test } from "vitest";
import {
  earthMeta,
  ecosystemMeta,
  failedPageMeta,
  failedWorldMeta,
  homeMeta,
  listMeta,
  missingUniverseMeta,
  notFoundMeta,
  worldMeta,
} from "./meta.ts";
import { site, siteOf, type UniverseView } from "./places.ts";
import { FIXTURE } from "./placesFixture.ts";

const onyx = site.universe(new Request("https://gno.world/"), "cosmos");
const bubble = site.world(new Request("https://gno.world/w/bubble"));
const other: UniverseView = {
  id: "gnoland",
  name: "gno.land",
  isDefault: false,
  testnet: false,
  rpc: "https://rpc.example.test",
  home: { path: "/net/gnoland/", canonical: "/net/gnoland/" },
  earth: { path: "/net/gnoland/earth", canonical: "/net/gnoland/earth" },
  worlds: [],
  ecosystems: [],
};

// The value of each tag a page carries, by its name, property, rel or title; a tag given twice is a fault.
function tags(meta: MetaDescriptor[]): Map<string, string> {
  const found = new Map<string, string>();
  for (const tag of meta) {
    const fields: Record<string, unknown> = tag;
    const rel = fields["rel"];
    const key =
      "title" in fields
        ? "title"
        : typeof rel === "string"
          ? `${String(fields["tagName"])}:${rel}`
          : String(fields["name"] ?? fields["property"]);
    expect(found.has(key), `${key} given twice`).toBe(false);
    found.set(key, String(fields["title"] ?? fields["href"] ?? fields["content"]));
  }
  return found;
}

describe("the tags of a page", () => {
  test("home names https://gno.world/net/onyx/ as its one address, the default universe's canonical", () => {
    const home = tags(homeMeta(onyx));
    expect(home.get("title")).toBe("gno.world");
    expect(home.get("description")?.length).toBeGreaterThanOrEqual(50);
    expect(home.get("description")?.length).toBeLessThanOrEqual(160);
    expect(home.get("link:canonical")).toBe("https://gno.world/net/onyx/");
    expect(home.get("og:url")).toBe("https://gno.world/net/onyx/");
    expect(home.get("og:title")).toBe(home.get("title"));
    expect(home.get("og:description")).toBe(home.get("description"));
    expect(home.get("og:type")).toBe("website");
  });

  test("a world names its own address, title and description, twice over for Open Graph", () => {
    const page = tags(worldMeta(bubble));
    expect(page.get("title")).toBe("Bubble · gno.world");
    expect(page.get("link:canonical")).toBe("https://gno.world/net/onyx/w/bubble");
    expect(page.get("og:url")).toBe("https://gno.world/net/onyx/w/bubble");
    expect(page.get("og:title")).toBe("Bubble · gno.world");
    expect(page.get("description")).toBe(bubble.description);
    expect(page.get("og:description")).toBe(page.get("description"));
    // Bubble is in Onyx, a testnet (app/data/universes.json): noindex. Was undefined before 5e.
    expect(page.get("robots")).toBe("noindex");
  });

  test.each([
    ["no world", worldMeta(undefined), "No world here · gno.world"],
    ["a world that could not load", failedWorldMeta(), "This world could not load · gno.world"],
    ["a path no route matches", notFoundMeta(), "No page here · gno.world"],
  ])("%s: its own title, not indexed, and no address of its own", (_, meta, title) => {
    const page = tags(meta);
    expect(page.get("title")).toBe(title);
    expect(page.get("robots")).toBe("noindex");
    expect(page.has("link:canonical")).toBe(false);
    expect(page.has("og:url")).toBe(false);
  });

  // 5d: the canonical of every page is under /net/<universe>, where core/places puts it (decisions, 2026-10-29), and
  // every page at that address exists: a canonical to a missing page would drop the page from search.
  test("a world's page names its canonical address, not the path it is served at", () => {
    expect(bubble.path).toBe("/w/bubble");
    expect(tags(worldMeta(bubble)).get("link:canonical")).toBe(`https://gno.world${bubble.canonical}`);
  });

  test("the Earth, the cosmos and the ecosystem of each universe name their own address under /net/<universe>", () => {
    expect(tags(earthMeta(onyx)).get("link:canonical")).toBe("https://gno.world/net/onyx/earth");
    expect(tags(earthMeta(onyx)).get("og:url")).toBe("https://gno.world/net/onyx/earth");
    expect(tags(earthMeta(other)).get("link:canonical")).toBe("https://gno.world/net/gnoland/earth");
    expect(tags(homeMeta(other)).get("link:canonical")).toBe("https://gno.world/net/gnoland/");
    expect(tags(homeMeta(other)).get("title")).toBe("gno.land · gno.world");
    const tokens = {
      slug: "tokens",
      name: "Tokens",
      description: "T".repeat(300),
      universe: "onyx",
      testnet: true,
      path: "/e/tokens",
      canonical: "/net/onyx/e/tokens",
    };
    const page = tags(ecosystemMeta(tokens));
    expect(page.get("link:canonical")).toBe("https://gno.world/net/onyx/e/tokens");
    expect(page.get("description")?.length).toBeLessThanOrEqual(160);
  });

  test("the list names /list: it has no place of its own in the data", () => {
    expect(tags(listMeta()).get("link:canonical")).toBe("https://gno.world/list");
  });

  test.each([
    ["no universe", missingUniverseMeta(), "No universe here · gno.world"],
    ["no ecosystem", ecosystemMeta(undefined), "No ecosystem here · gno.world"],
    ["a page that could not load", failedPageMeta(), "This page could not load · gno.world"],
  ])("%s: its own title, not indexed, and no address", (_, meta, title) => {
    const page = tags(meta);
    expect(page.get("title")).toBe(title);
    expect(page.get("robots")).toBe("noindex");
    expect(page.has("link:canonical")).toBe(false);
  });

  test("each page describes itself differently", () => {
    const descriptions = [
      homeMeta(onyx),
      earthMeta(onyx),
      homeMeta(other),
      earthMeta(other),
      ...site.worlds.map(worldMeta),
      listMeta(),
    ].map((meta) => tags(meta).get("description"));
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });
});

// Slice 5's 5e: what a search engine and a share read of each place's page. The fixture's Onyx is a testnet, as the
// data's is (app/data/universes.json); its gno.land is the mainnet. Walked with each universe the default: a mainnet
// place's path is its canonical address only when it is not.
const fixture = (defaultId: string) =>
  siteOf({
    ...FIXTURE,
    universes: FIXTURE.universes.map((universe) => ({
      id: universe.id,
      name: universe.name,
      rpc: universe.rpc,
      testnet: universe.id === "onyx",
      ...(universe.id === defaultId ? { default: true as const } : {}),
    })),
  });

// Every page the site has a place for, with the universe it is in, and what its meta says.
const pages = ["onyx", "gnoland"].flatMap((defaultId) => {
  const built = fixture(defaultId);
  const label = `${defaultId} default`;
  return [
    ...["onyx", "gnoland"].flatMap((id) => {
      const universe = built.universe(new Request(`https://gno.world/net/${id}/`), "cosmos");
      const testnet = id === "onyx";
      return [
        {
          name: `${label}: the cosmos of ${id}`,
          testnet,
          canonical: universe.home.canonical,
          heading: undefined,
          meta: () => homeMeta(universe),
        },
        {
          name: `${label}: the Earth of ${id}`,
          testnet,
          canonical: universe.earth.canonical,
          heading: undefined,
          meta: () => earthMeta(universe),
        },
      ];
    }),
    ...built.worlds.map((world) => ({
      name: `${label}: the world ${world.universe}/${world.slug}`,
      testnet: world.universe === "onyx",
      canonical: world.canonical,
      heading: world.name,
      meta: () => worldMeta(world),
    })),
    ...built.ecosystems.map((ecosystem) => ({
      name: `${label}: the ecosystem ${ecosystem.universe}/${ecosystem.slug}`,
      testnet: ecosystem.universe === "onyx",
      canonical: ecosystem.canonical,
      heading: ecosystem.name,
      meta: () => ecosystemMeta(ecosystem),
    })),
  ];
});

const content = (meta: MetaDescriptor[], key: "name" | "property", value: string) =>
  meta.flatMap((tag) => {
    const fields: Record<string, unknown> = tag;
    return fields[key] === value ? [String(fields["content"])] : [];
  });
const title = (meta: MetaDescriptor[]) => meta.flatMap((tag) => ("title" in tag ? [String(tag.title)] : []))[0];
const ld = (meta: MetaDescriptor[]) => meta.flatMap((tag) => ("script:ld+json" in tag ? [tag["script:ld+json"]] : []));

describe("the places the tests walk", () => {
  test("hold a world and an ecosystem on a testnet and on the mainnet, so no case goes unseen", () => {
    expect(pages.filter((page) => page.testnet).length).toBeGreaterThan(2);
    expect(pages.filter((page) => !page.testnet).length).toBeGreaterThan(2);
    expect(pages.some((page) => page.name.includes("the world gnoland/"))).toBe(true);
    expect(pages.some((page) => page.name.includes("the ecosystem gnoland/"))).toBe(true);
  });
});

// Each test builds its page: a value made at collection time is outside any test, where StrykerJS turns no mutant on.
describe.each(pages)("the page of $name", ({ meta: build, testnet, canonical, heading }) => {
  test("carries a Twitter Card that repeats its title and description", () => {
    const meta = build();
    expect(content(meta, "name", "twitter:card")).toEqual(["summary"]);
    expect(content(meta, "name", "twitter:title")).toEqual([title(meta)]);
    expect(content(meta, "name", "twitter:description")).toEqual(content(meta, "name", "description"));
  });

  test(testnet ? "is noindex, a testnet's page, with its canonical address kept" : "is indexed", () => {
    const meta = build();
    expect(content(meta, "name", "robots")).toEqual(testnet ? ["noindex"] : []);
    expect(content(meta, "property", "og:url")).toEqual([`https://gno.world${canonical}`]);
  });

  test("holds one JSON-LD of a WebPage at its canonical address, that survives being read back", () => {
    const meta = build();
    const [only, ...more] = ld(meta);
    expect(more).toEqual([]);
    const parsed: unknown = JSON.parse(JSON.stringify(only));
    expect(parsed).toMatchObject({
      "@context": "https://schema.org",
      "@type": "WebPage",
      url: `https://gno.world${canonical}`,
      description: content(meta, "name", "description")[0],
    });
    // A world or an ecosystem names itself; a cosmos or an Earth, by its page's title.
    expect(parsed).toMatchObject({ name: heading ?? title(meta)?.replace(/ · gno\.world$/, "") });
  });
});

describe("a page that is no place", () => {
  test("the list has its Twitter Card and JSON-LD, and is indexed", () => {
    const meta = listMeta();
    expect(content(meta, "name", "twitter:card")).toEqual(["summary"]);
    expect(content(meta, "name", "robots")).toEqual([]);
    expect(ld(meta)).toHaveLength(1);
    expect(ld(meta)[0]).toMatchObject({ "@type": "WebPage", name: "Places", url: "https://gno.world/list" });
  });

  test("an unknown world or ecosystem or universe, and a page that failed, carry no card and no JSON-LD, and are noindex", () => {
    const unindexed = [
      worldMeta(undefined),
      ecosystemMeta(undefined),
      missingUniverseMeta(),
      failedWorldMeta(),
      failedPageMeta(),
      notFoundMeta(),
    ];
    for (const meta of unindexed) {
      expect(ld(meta)).toEqual([]);
      expect(content(meta, "name", "twitter:card")).toEqual([]);
      expect(content(meta, "name", "robots")).toEqual(["noindex"]);
    }
  });
});
