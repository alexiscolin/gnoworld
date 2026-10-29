import type { MetaDescriptor } from "react-router";
import { describe, expect, test } from "vitest";
import { failedWorldMeta, homeMeta, notFoundMeta, worldMeta } from "./meta.ts";
import { findWorld, worldPath, WORLDS } from "./places.ts";

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
  test("home names https://gno.world/ as its one address", () => {
    const home = tags(homeMeta());
    expect(home.get("title")).toBe("gno.world");
    expect(home.get("description")?.length).toBeGreaterThanOrEqual(50);
    expect(home.get("description")?.length).toBeLessThanOrEqual(160);
    expect(home.get("link:canonical")).toBe("https://gno.world/");
    expect(home.get("og:url")).toBe("https://gno.world/");
    expect(home.get("og:title")).toBe(home.get("title"));
    expect(home.get("og:description")).toBe(home.get("description"));
    expect(home.get("og:type")).toBe("website");
  });

  test("a world names its own address, title and description, twice over for Open Graph", () => {
    const bubble = tags(worldMeta(findWorld("bubble")));
    expect(bubble.get("title")).toBe("Bubble · gno.world");
    expect(bubble.get("link:canonical")).toBe("https://gno.world/w/bubble");
    expect(bubble.get("og:url")).toBe("https://gno.world/w/bubble");
    expect(bubble.get("og:title")).toBe("Bubble · gno.world");
    expect(bubble.get("description")).toBe(findWorld("bubble").description);
    expect(bubble.get("og:description")).toBe(bubble.get("description"));
    expect(bubble.get("robots")).toBeUndefined();
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

  // In 5c the canonical is the page's own address, /w/bubble: the /net/onyx/ form of core/places (decisions, 2026-10-29)
  // names a page that exists with 5d, and a canonical to a missing page would drop the world from search.
  test("a world's path is the one its page names as canonical", () => {
    const bubble = findWorld("bubble");
    expect(worldPath(bubble)).toBe("/w/bubble");
    expect(tags(worldMeta(bubble)).get("link:canonical")).toBe(`https://gno.world${worldPath(bubble)}`);
  });

  test("home and each world describe themselves differently", () => {
    const descriptions = [homeMeta(), ...WORLDS.map(worldMeta)].map((meta) => tags(meta).get("description"));
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });
});
