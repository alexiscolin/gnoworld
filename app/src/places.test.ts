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

const fixtureSite = () => siteOf(FIXTURE);

// F2206: a build at a module's load is a static mutant, which StrykerJS leaves unjudged.
describe("a site", () => {
  test("reads its data only when first asked, never when made", () => {
    let reads = 0;
    const counted = { ...FIXTURE };
    Object.defineProperty(counted, "universes", {
      get() {
        reads += 1;
        return FIXTURE.universes;
      },
    });
    const made = siteOf(counted);
    expect(reads).toBe(0);
    expect(made.worlds.length).toBeGreaterThan(0);
    const once = reads;
    expect(once).toBeGreaterThan(0);
    expect(made.places.length).toBeGreaterThan(0);
    expect(reads).toBe(once);
  });
});

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
        testnet: true,
        path: "/w/bubble",
        canonical: "/net/onyx/w/bubble",
      },
    ]);
  });

  test("each has a name fit for a path and a description fit for search", () => {
    for (const world of site.worlds) {
      expect(world.slug, world.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(world.description.length, world.slug).toBeGreaterThanOrEqual(50);
      expect(world.description.length, world.slug).toBeLessThanOrEqual(160);
    }
  });
});

test("no two worlds share a name in a universe, nor a path", () => {
  for (const each of [site, fixtureSite()]) {
    expect(new Set(each.worlds.map((world) => `${world.universe}/${world.slug}`)).size).toBe(each.worlds.length);
    expect(new Set(each.worlds.map((world) => world.path)).size).toBe(each.worlds.length);
  }
});

describe("a site of several universes, an ecosystem and a world of another universe", () => {
  test("finds each world and ecosystem at the path of its universe, and no other", () => {
    expect(fixtureSite().world(at("/net/gnoland/w/other")).universe).toBe("gnoland");
    expect(fixtureSite().ecosystem(at("/e/tokens")).universe).toBe("onyx");
    expect(fixtureSite().ecosystem(at("/net/gnoland/e/tokens")).universe).toBe("gnoland");
    for (const path of ["/net/gnoland/w/bubble", "/w/other", "/net/nowhere/w/bubble", "/E/tokens", "/e/Tokens"])
      expect(
        status(() => fixtureSite().world(at(path))),
        path,
      ).toMatchObject({ init: { status: 404 } });
    for (const path of ["/E/tokens", "/e/Tokens", "/net/Onyx/e/tokens", "/e/bubble", "/net/gnoland/e/other"])
      expect(
        status(() => fixtureSite().ecosystem(at(path))),
        path,
      ).toMatchObject({ init: { status: 404 } });
  });

  test("keeps a world and an ecosystem of one name apart", () => {
    expect(fixtureSite().world(at("/w/tokens")).path).toBe("/w/tokens");
    expect(fixtureSite().ecosystem(at("/e/tokens")).path).toBe("/e/tokens");
  });

  test("gives each universe its cosmos, its Earth and what it holds, by the case of its path", () => {
    const gnoland = fixtureSite().universe(at("/net/gnoland/earth"), "earth");
    expect(gnoland.worlds.map((world) => world.path)).toEqual(["/net/gnoland/w/other"]);
    expect(gnoland.home).toEqual({ path: "/net/gnoland/", canonical: "/net/gnoland/" });
    expect(fixtureSite().universe(at("/net/gnoland"), "cosmos").id).toBe("gnoland");
    expect(fixtureSite().universe(at("/net/onyx/"), "cosmos").home.path).toBe("/");
    for (const path of ["/net/nowhere/earth", "/net/Onyx/earth", "/net/ONYX/earth", "/net/onyx/EARTH"])
      expect(
        status(() => fixtureSite().universe(at(path), "earth")),
        path,
      ).toMatchObject({ init: { status: 404 } });
  });

  test.each(["constructor", "__proto__", "toString", "hasOwnProperty"])("a universe named %s is not found", (name) => {
    expect(status(() => fixtureSite().universe(at(`/net/${name}/earth`), "earth"))).toMatchObject({
      init: { status: 404 },
    });
    expect(status(() => fixtureSite().ecosystem(at(`/e/${name}`)))).toMatchObject({ init: { status: 404 } });
  });
});
