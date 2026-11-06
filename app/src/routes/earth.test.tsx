// @vitest-environment jsdom
import { isRouteErrorResponse, type MetaArgs, type RouteObject } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";
import { fakeStream } from "../../tests/fakeStream.ts";
import { expectClientAsBuild, render, routeError } from "../../tests/render.tsx";
import { drawRoute, expectStreamClosedOnLeave } from "../../tests/routed.tsx";
import Earth, { clientLoader, ErrorBoundary, loader, meta } from "./earth.tsx";

const route = (path: string): RouteObject => ({ path, Component: Earth, loader, ErrorBoundary });
const canonical = (tags: ReturnType<typeof meta>) =>
  tags.find((t) => "rel" in t && t["rel"] === "canonical") as { href: string } | undefined;

describe("the Earth's page", () => {
  test("is the default universe's at /earth, with its heading and its name", async () => {
    const html = await render(route("/earth"), "/earth");
    expect(html).toContain("<h1>Earth</h1>");
    expect(html).toContain("Onyx");
  });

  test("is every universe's under /net/:network", async () => {
    const html = await render(route("/net/:network/earth"), "/net/gnoland/earth");
    expect(html).toContain("<h1>Earth</h1>");
    expect(html).toContain("gno.land");
  });

  test("holds the chat's place in the page, the dock of the frames, in every universe: one Earth, one general chat", async () => {
    const html = await render(route("/earth"), "/earth");
    expect(html).toMatch(/id="chat"/);
    const other = await render(route("/net/:network/earth"), "/net/gnoland/earth");
    expect(other).toMatch(/id="chat"/);
  });

  test("keeps the globe's place in the page, which only the scene fills", async () => {
    const html = await render(route("/earth"), "/earth");
    expect(html).toMatch(/<div[^>]*data-globe[^>]*data-earth="waiting"[^>]*><\/div>/);
  });

  test("lists no world: the Earth's plate is its general chat's, and the list is the List's (8g, frames 37 to 42)", async () => {
    const onyx = await render(route("/net/:network/earth"), "/net/onyx/earth");
    expect(onyx).not.toMatch(/<a [^>]*href="\/w\/bubble"/);
    expect(onyx).not.toMatch(/no world yet/i);
  });

  test("is a 404 for an unknown universe: React Router's, not a crash", async () => {
    const error = await routeError(route("/net/:network/earth"), "/net/nowhere/earth");
    expect(isRouteErrorResponse(error) && error.status).toBe(404);
    const html = await render(route("/net/:network/earth"), "/net/nowhere/earth");
    expect(html).toContain('role="alert"');
    expect(html).toContain("No universe here");
    expect(html).not.toContain("<h1>Earth</h1>");
    expect(html).not.toContain("nowhere");
  });

  test("carries not-indexed tags for a 404, and none for an error that is no 404", async () => {
    const error = await routeError(route("/net/:network/earth"), "/net/nowhere/earth");
    const tags = meta({ loaderData: undefined, error } as unknown as MetaArgs<typeof loader>);
    expect(tags).toEqual(expect.arrayContaining([{ name: "robots", content: "noindex" }]));
    expect(canonical(tags)).toBeUndefined();
  });

  test.each([
    ["/earth", "/net/onyx/earth"],
    ["/net/onyx/earth", "/net/onyx/earth"],
    ["/net/gnoland/earth", "/net/gnoland/earth"],
  ])("carries one canonical address, always under /net/<universe>: %s", (path, expected) => {
    const request = new Request(`https://gno.world${path}`);
    const tags = meta({ loaderData: loader({ request }) } as unknown as MetaArgs<typeof loader>);
    expect(canonical(tags)?.href).toBe(`https://gno.world${expected}`);
  });

  test("has frame 40's crumb: the universe, a link to its cosmos, then the home, the general chat", async () => {
    const html = await render(route("/net/:network/earth"), "/net/gnoland/earth");
    expect(html).toMatch(/<nav [^>]*aria-label="[^"]+"/);
    expect(html).toMatch(/<a [^>]*href="\/net\/gnoland\/"[^>]*>Universe<\/a>/);
    expect(html).toMatch(/aria-current="page"[^>]*>Home · the general chat</);
  });
});

// The browser serves the pages the build wrote, from the same data (F2208).
test("the browser's loader gives each pre-rendered earth what the build's does", () => {
  expectClientAsBuild("earth", clientLoader, loader);
});

// Slice 5r (frames 37 to 42): the Earth's page is a plate, with no 3D.
describe("the Earth's plate", () => {
  test("is a plate named Earth, holding the one heading and the line of frame 40", async () => {
    const html = await render({ path: "/earth", Component: Earth, loader }, "/earth");
    const plate = /<section [^>]*data-look="plate"[^>]*>/.exec(html)?.[0] ?? "";
    expect(plate).toContain('aria-label="Earth"');
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain("Where people speak from. Countries are opt-in.");
  });

  test("says hi in #general, and holds the latest on X and the three links out, each to its own tab", async () => {
    const html = await render({ path: "/earth", Component: Earth, loader }, "/earth");
    expect(html).toMatch(/>Say hi in #general</);
    expect(html).toMatch(/Latest on X/);
    expect(html).toMatch(/<a [^>]*href="https:\/\/x\.com\/_gnoland"[^>]*target="_blank"/);
    for (const [label, href] of [
      ["View on gnoweb", "https://onyx.testnets.gno.land"],
      ["Explorer", "https://gnoscan.io/?chainId=onyx-1"],
      ["Docs", "https://docs.gno.land/"],
    ] as const)
      expect(html).toMatch(
        new RegExp(
          `href="${href.replaceAll(".", "\\.").replaceAll("?", "\\?")}" target="_blank" rel="noopener noreferrer"><div[^>]*>${label}<`,
        ),
      );
  });

  test("shows the realms deployed in 24 h as coming soon, greyed and said so (slice 9)", async () => {
    const html = await render({ path: "/earth", Component: Earth, loader }, "/earth");
    expect(html).toMatch(/aria-label="Realms deployed in 24 h, coming soon"/);
    expect(html).toMatch(/aria-disabled="true"/);
  });

  test("shows its vertical atlas caption to the eye only, and no figure the data does not hold", async () => {
    const html = await render({ path: "/earth", Component: Earth, loader }, "/earth");
    expect(html).toContain("gnoworld");
    expect(html).toMatch(/aria-hidden="true"[^>]*><p [^>]*>gnoworld/);
    expect(html).not.toMatch(/<(canvas|video|picture|figure)\b/i);
    // Frame 26's planet thumbs are the only pictures, each decorative (its name sits beside it).
    for (const image of html.match(/<img\b[^>]*>/g) ?? []) expect(image).toContain('alt=""');
  });

  test("offers Follow and Share in the page the build writes, as frame 86 draws them", async () => {
    const html = await render({ path: "/earth", Component: Earth, loader }, "/earth");
    expect(html).toMatch(/>Follow</);
    expect(html).toMatch(/>Share</);
  });
});

// Slice 9g (F5784, frame 38): the page follows the Earth's room once it has run, and draws the count the stream tells, for its own universe.
describe("the Earth's page and the chain's stream", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  const drawn = () => {
    const sources = fakeStream();
    // The figure counts up only where motion is welcome: jsdom has no media query, so none.
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const page = drawRoute({ path: "/net/:network/earth", Component: Earth, loader: clientLoader }, "/net/onyx/earth");
    return { sources, ...page };
  };

  test("follows #earth, draws the count of its universe from a realms frame, and ignores another universe's", async () => {
    const { sources, box } = drawn();
    await vi.waitFor(() => {
      expect(sources.opened.map(({ url }) => url)).toEqual(["/api/stream?rooms=%23earth"]);
    });
    // Until the stream tells a count, the slot is main's coming soon: no figure, never a made-up zero.
    expect(box.textContent).not.toContain("block");
    sources.opened[0]?.emit("realms", { universe: "gnoland", count: 99, height: 5 });
    expect(box.textContent).not.toContain("block");
    sources.opened[0]?.emit("realms", { universe: "onyx", count: 17, height: 908297 });
    await vi.waitFor(() => {
      expect(box.textContent).toContain("17");
    });
    expect(box.textContent).toContain("deployed in 24 h · block 908297");
  });

  test("closes the stream when the page is left", async () => {
    await expectStreamClosedOnLeave(
      { path: "/net/:network/earth", Component: Earth, loader: clientLoader },
      "/net/onyx/earth",
    );
  });
});
