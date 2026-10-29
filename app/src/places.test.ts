import { describe, expect, test } from "vitest";
import { site, siteOf } from "./places.ts";
import { FIXTURE } from "./placesFixture.ts";

const at = (path: string) => new Request(`https://gno.world${path}`);
const status = (run: () => unknown): unknown => {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
};

const fixture = siteOf(FIXTURE);

describe("the site's worlds, by request", () => {
  test("finds a world by its path, as written", () => {
    expect(site.world(at("/w/bubble")).name).toBe("Bubble");
    expect(site.world(at("/net/onyx/w/bubble")).name).toBe("Bubble");
  });

  test.each([
    "/w/nowhere",
    "/",
    "",
    "/W/bubble",
    "/w/Bubble",
    "/w/bubble/extra",
    "/w//bubble",
    "/w/__proto__",
    "/w/constructor",
    "/w/bubble%00",
    "/w/%62ubble",
    "/earth",
  ])("answers %j with a 404", (path) => {
    expect(status(() => site.world(at(path)))).toMatchObject({ init: { status: 404 } });
  });

  test("serves a path with a trailing slash, and with a query or a fragment, as the path", () => {
    for (const path of ["/w/bubble/", "/w/bubble?utm=1", "/w/bubble#top", "/w/bubble/?a=1#b"])
      expect(site.world(at(path)).slug, path).toBe("bubble");
  });
});

describe("the worlds of the data files", () => {
  test("hold Bubble, at /w/bubble, its canonical under /net/onyx", () => {
    expect(site.worlds).toEqual([
      {
        slug: "bubble",
        name: "Bubble",
        description:
          "Bubble, a world of gno.land: the BUBBLE token, its governance, and the games played with it on chain.",
        universe: "onyx",
        path: "/w/bubble",
        canonical: "/net/onyx/w/bubble",
      },
    ]);
  });

  test.each(site.worlds.map((world) => [world.slug, world]))(
    "%s has a name fit for a path and a description fit for search",
    (_, world) => {
      expect(world.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(world.description.length).toBeGreaterThanOrEqual(50);
      expect(world.description.length).toBeLessThanOrEqual(160);
    },
  );
});

test("no two worlds share a name in a universe, nor a path", () => {
  for (const each of [site, fixture]) {
    expect(new Set(each.worlds.map((world) => `${world.universe}/${world.slug}`)).size).toBe(each.worlds.length);
    expect(new Set(each.worlds.map((world) => world.path)).size).toBe(each.worlds.length);
  }
});

describe("a site of several universes, an ecosystem and a world of another universe", () => {
  test("finds each world and ecosystem at the path of its universe, and no other", () => {
    expect(fixture.world(at("/net/gnoland/w/other")).universe).toBe("gnoland");
    expect(fixture.ecosystem(at("/e/tokens")).universe).toBe("onyx");
    expect(fixture.ecosystem(at("/net/gnoland/e/tokens")).universe).toBe("gnoland");
    for (const path of ["/net/gnoland/w/bubble", "/w/other", "/net/nowhere/w/bubble", "/E/tokens", "/e/Tokens"])
      expect(
        status(() => fixture.world(at(path))),
        path,
      ).toMatchObject({ init: { status: 404 } });
    for (const path of ["/E/tokens", "/e/Tokens", "/net/Onyx/e/tokens", "/e/bubble", "/net/gnoland/e/other"])
      expect(
        status(() => fixture.ecosystem(at(path))),
        path,
      ).toMatchObject({ init: { status: 404 } });
  });

  test("keeps a world and an ecosystem of one name apart", () => {
    expect(fixture.world(at("/w/tokens")).path).toBe("/w/tokens");
    expect(fixture.ecosystem(at("/e/tokens")).path).toBe("/e/tokens");
  });

  test("gives each universe its cosmos, its Earth and what it holds, by the case of its path", () => {
    const gnoland = fixture.universe(at("/net/gnoland/earth"), "earth");
    expect(gnoland.worlds.map((world) => world.path)).toEqual(["/net/gnoland/w/other"]);
    expect(gnoland.home).toEqual({ path: "/net/gnoland/", canonical: "/net/gnoland/" });
    expect(fixture.universe(at("/net/gnoland"), "cosmos").id).toBe("gnoland");
    expect(fixture.universe(at("/net/onyx/"), "cosmos").home.path).toBe("/");
    for (const path of ["/net/nowhere/earth", "/net/Onyx/earth", "/net/ONYX/earth", "/net/onyx/EARTH"])
      expect(
        status(() => fixture.universe(at(path), "earth")),
        path,
      ).toMatchObject({ init: { status: 404 } });
  });

  test.each(["constructor", "__proto__", "toString", "hasOwnProperty"])("a universe named %s is not found", (name) => {
    expect(status(() => fixture.universe(at(`/net/${name}/earth`), "earth"))).toMatchObject({ init: { status: 404 } });
    expect(status(() => fixture.ecosystem(at(`/e/${name}`)))).toMatchObject({ init: { status: 404 } });
  });
});
