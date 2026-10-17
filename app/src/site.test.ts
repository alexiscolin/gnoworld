import type { MetaDescriptor } from "react-router";
import { describe, expect, test } from "vitest";
import { findWorld, homeMeta, worldMeta, WORLDS } from "./site.ts";

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

describe("findWorld", () => {
  test("finds a world by its name in the path", () => {
    expect(findWorld("bubble").name).toBe("Bubble");
  });

  test.each([["nowhere"], [undefined], [""], ["Bubble"], ["bubble/"]])("answers %j with a 404", (slug) => {
    let thrown: unknown;
    try {
      findWorld(slug);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({ init: { status: 404 } });
  });
});

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

  test("no world: not found, not indexed, and no address of its own", () => {
    const missing = tags(worldMeta(undefined));
    expect(missing.get("title")).toBe("No world here · gno.world");
    expect(missing.get("robots")).toBe("noindex");
    expect(missing.has("link:canonical")).toBe(false);
    expect(missing.has("og:url")).toBe(false);
  });

  test("home and each world describe themselves differently", () => {
    const descriptions = [homeMeta(), ...WORLDS.map(worldMeta)].map((meta) => tags(meta).get("description"));
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });
});

describe("the list of worlds", () => {
  test.each(WORLDS.map((world) => [world.slug, world]))(
    "%s has a name fit for a path and a description fit for search",
    (_, world) => {
      expect(world.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(world.description.length).toBeGreaterThanOrEqual(50);
      expect(world.description.length).toBeLessThanOrEqual(160);
    },
  );

  test("no two worlds share a name", () => {
    expect(new Set(WORLDS.map((world) => world.slug)).size).toBe(WORLDS.length);
  });
});
