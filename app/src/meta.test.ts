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
import { site, type UniverseView } from "./places.ts";

const onyx = site.universe(new Request("https://gno.world/"), "cosmos");
const bubble = site.world(new Request("https://gno.world/w/bubble"));
const other: UniverseView = {
  id: "gnoland",
  name: "gno.land",
  isDefault: false,
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
    expect(page.get("robots")).toBeUndefined();
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
