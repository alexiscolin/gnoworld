import type { ClientLoaderFunctionArgs } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { headingOf, render, routeError } from "../tests/render.tsx";
import Earth, {
  clientLoader as earthLoader,
  ErrorBoundary as EarthError,
  loader as earth,
  meta as earthMeta,
} from "./routes/earth.tsx";
import Ecosystem, {
  clientLoader as ecosystemLoader,
  ErrorBoundary as EcosystemError,
  meta as ecosystemMeta,
} from "./routes/ecosystem.tsx";
import Home, { ErrorBoundary as HomeError, loader as home, meta as homeMeta } from "./routes/home.tsx";
import List, { clientLoader as listLoader, meta as listMeta } from "./routes/list.tsx";
import World, { ErrorBoundary as WorldError, loader as world } from "./routes/world.tsx";

// The routes on a site that holds what the real data does not: an ecosystem, and a world in a second universe.
vi.mock("./places.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./places.ts")>();
  const { FIXTURE } = await import("./placesFixture.ts");
  return { ...actual, site: actual.siteOf(FIXTURE) };
});

const routes = {
  earth: { Component: Earth, loader: earth, ErrorBoundary: EarthError },
  home: { Component: Home, loader: home, ErrorBoundary: HomeError },
  ecosystem: { Component: Ecosystem, loader: ecosystemLoader, ErrorBoundary: EcosystemError },
  world: { Component: World, loader: world, ErrorBoundary: WorldError },
};
const page = (kind: keyof typeof routes, path: string) => render({ path: "*", ...routes[kind] }, path);
const asked = (path: string) =>
  ({ params: {}, request: new Request(`https://gno.world${path}`) }) as unknown as ClientLoaderFunctionArgs;
// What a loader throws for a 404 is React Router's `data(null, { status: 404 })`, with its init.
const is404 = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return (
      typeof error === "object" &&
      error !== null &&
      "init" in error &&
      typeof error.init === "object" &&
      error.init !== null &&
      "status" in error.init &&
      error.init.status === 404
    );
  }
  return false;
};

describe("an ecosystem's page", () => {
  test("shows its name, its words and its trail to the Earth", async () => {
    const html = await page("ecosystem", "/e/tokens");
    expect(html).toContain("<h1>Tokens</h1>");
    expect(html).toContain("Tokens, a place of the fixture");
    expect(html).toMatch(/<a [^>]*href="\/"[^>]*>Onyx<\/a>/);
    expect(html).toMatch(/<a [^>]*href="\/earth"[^>]*>Earth<\/a>/);
    expect(html).toMatch(/aria-current="page"[^>]*>Tokens</);
  });

  test("is the other universe's own at its own path, its trail leading to that universe", async () => {
    const html = await page("ecosystem", "/net/gnoland/e/tokens");
    expect(html).toContain("<h1>Tokens of gno.land</h1>");
    expect(html).toMatch(/<a [^>]*href="\/net\/gnoland\/"[^>]*>gno\.land<\/a>/);
    expect(html).toMatch(/<a [^>]*href="\/net\/gnoland\/earth"[^>]*>Earth<\/a>/);
  });

  test.each(["/E/tokens", "/e/Tokens", "/net/gnoland/e/bubble", "/e/nowhere"])("%s is a 404 alert", async (path) => {
    const html = await page("ecosystem", path);
    expect(html).toContain('role="alert"');
    expect(html).toContain("No ecosystem here");
  });

  test("carries its address under /net/<universe>, and not-found tags when none is found", async () => {
    const found = ecosystemMeta({ location: { pathname: "/e/tokens" } } as never);
    expect(found).toEqual(
      expect.arrayContaining([expect.objectContaining({ href: "https://gno.world/net/onyx/e/tokens" })]),
    );
    const error = await routeError({ path: "*", ...routes.ecosystem }, "/E/tokens");
    expect(ecosystemMeta({ error, location: { pathname: "/E/tokens" } } as never)).toEqual(
      expect.arrayContaining([{ name: "robots", content: "noindex" }]),
    );
  });

  test("carries could-not-load tags for an error that is no 404", () => {
    const tags = ecosystemMeta({ error: new Error("boom"), location: { pathname: "/e/tokens" } } as never);
    expect(tags).toEqual(
      expect.arrayContaining([expect.objectContaining({ title: "This page could not load · gno.world" })]),
    );
  });

  test("checks the case of its path in the browser, a query and a fragment aside", () => {
    expect(ecosystemLoader(asked("/e/tokens?x=1")).slug).toBe("tokens");
    expect(ecosystemLoader(asked("/e/tokens#a")).slug).toBe("tokens");
    expect(is404(() => ecosystemLoader(asked("/E/tokens")))).toBe(true);
  });
});

describe("the Earth of a universe that holds worlds", () => {
  test("links a world of another universe at that universe's path", async () => {
    const html = await page("earth", "/net/gnoland/earth");
    expect(html).toMatch(/<a [^>]*href="\/net\/gnoland\/w\/other"/);
    expect(html).toContain("Other");
    expect(html).not.toContain("Bubble");
    expect(html).not.toMatch(/no world yet/i);
  });

  test("lists the ecosystems of its universe, and no other", async () => {
    const html = await page("earth", "/earth");
    expect(html).toMatch(/<a [^>]*href="\/e\/tokens"[^>]*>Tokens<\/a>/);
    expect(html).not.toContain("Tokens of gno.land");
  });

  test("has a trail to its universe's home, ending on the Earth", async () => {
    const html = await page("earth", "/net/gnoland/earth");
    expect(html).toMatch(/<a [^>]*href="\/net\/gnoland\/"[^>]*>gno\.land<\/a>/);
    expect(html).toMatch(/aria-current="page"[^>]*>Earth</);
  });

  test("carries the loader's own address in its tags", () => {
    const tags = earthMeta({ loaderData: earth(asked("/net/gnoland/earth")) } as never);
    expect(tags).toEqual(
      expect.arrayContaining([expect.objectContaining({ href: "https://gno.world/net/gnoland/earth" })]),
    );
  });

  test.each(["/Earth", "/net/Onyx/earth", "/net/ONYX/earth", "/net/onyx/EARTH", "/net/nowhere/earth"])(
    "refuses %s in the browser with a 404",
    (path) => {
      expect(is404(() => earthLoader(asked(path)))).toBe(true);
    },
  );
});

describe("a universe's index", () => {
  test("is the cosmos of the universe at /net/<id>/: its name, its worlds, a way to its Earth", async () => {
    const html = await page("home", "/net/gnoland/");
    // F3267: the hero's kicker names the universe, and the heading is its line, what the page holds.
    expect(html).toMatch(/<p [^>]*>(?:<span [^>]*><\/span>)?gno\.land<\/p>/);
    expect(headingOf(html)).toBe("1 world in gno.land");
    expect(html).toMatch(/<a [^>]*href="\/net\/gnoland\/w\/other"/);
    expect(html).toContain("Other");
    // Slice 5r: the way to the Earth is the hero's big action, "Go explore" (frame 6), and the header's Earth view.
    expect(html).toMatch(/<a [^>]*href="\/net\/gnoland\/earth"[^>]*>Go explore/);
    // Onyx's world is not listed here; the ticker's placeholder news names it, and is the site's, not a universe's.
    expect(html).not.toContain("/w/bubble");
    expect(html).not.toMatch(/>Bubble<\/a>/);
  });

  test("is the home itself for the default universe, at / and at /net/onyx/", async () => {
    for (const path of ["/", "/net/onyx/"]) {
      const html = await page("home", path);
      expect(html, path).toMatch(/<p [^>]*>(?:<span [^>]*><\/span>)?gno\.world<\/p>/);
      // The default universe's count is the cosmos's, which the browser reads once the scene runs (7d6): none in the build.
      expect(headingOf(html), path).toBe("Worlds in Onyx");
    }
  });

  test.each(["/net/nowhere/", "/net/Onyx/", "/net/constructor/"])(
    "%s is a 404 alert that names no universe",
    async (path) => {
      const html = await page("home", path);
      expect(html).toContain("No universe here");
      expect(html).not.toMatch(/nowhere|constructor|Onyx\//);
    },
  );

  test("carries its universe's address", () => {
    const tags = homeMeta({ loaderData: home(asked("/net/gnoland/")) } as never);
    expect(tags).toEqual(expect.arrayContaining([expect.objectContaining({ href: "https://gno.world/net/gnoland/" })]));
  });
});

describe("a world of another universe", () => {
  test("is at its universe's path, its kicker naming that universe", async () => {
    const html = await page("world", "/net/gnoland/w/other");
    expect(html).toContain("<h1>Other</h1>");
    expect(html).toMatch(/<p class="label[^"]*">gno\.land<\/p><h1>Other<\/h1>/);
  });

  test.each(["/net/gnoland/w/bubble", "/w/other", "/net/nowhere/w/other", "/net/onyx/w/other"])(
    "%s is not found: a world answers at its own universe's address alone",
    async (path) => {
      expect(await page("world", path)).toContain("No world here");
    },
  );
});

describe("the page that lists the places", () => {
  test("lists the places of every universe, as links to their pages", async () => {
    const html = await render({ path: "/list", Component: List }, "/list");
    expect(html).toMatch(/href="\/net\/gnoland\/w\/other"/);
    expect(html).toMatch(/href="\/e\/tokens"/);
  });

  // F2209: a chip for a genre no place has would only empty the list.
  test("offers no genre that no place has, though the data lists some", async () => {
    const html = await render({ path: "/list", Component: List }, "/list");
    expect(html).not.toContain('aria-label="Genres"');
    expect(html).not.toContain("Game");
  });

  test("has a trail to the home, ending on the list", async () => {
    const html = await render({ path: "/list", Component: List }, "/list");
    expect(html).toMatch(/<a [^>]*href="\/"[^>]*>Home<\/a>/);
    expect(html).toMatch(/aria-current="page"[^>]*>Places</);
  });

  test.each(["/LIST", "/List", "/list/x"])("refuses %s in the browser with a 404", (path) => {
    expect(is404(() => listLoader(asked(path)))).toBe(true);
  });

  test.each(["/list", "/list/", "/list?genre=game", "/list#top"])("serves %s", (path) => {
    expect(is404(() => listLoader(asked(path)))).toBe(false);
  });

  test("names /list as its canonical address", () => {
    expect(listMeta()).toEqual(expect.arrayContaining([expect.objectContaining({ href: "https://gno.world/list" })]));
  });
});
