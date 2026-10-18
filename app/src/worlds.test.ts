import { describe, expect, test } from "vitest";
import { findWorld, WORLDS } from "./worlds.ts";

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
