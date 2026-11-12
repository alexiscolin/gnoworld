// @vitest-environment jsdom
import { isRouteErrorResponse, type MetaArgs, type RouteObject } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { expectFollowAndShare } from "../../tests/plateButtons.ts";
import { fakeStream } from "../../tests/fakeStream.ts";
import { noMedia, noObservers } from "../../tests/mount.tsx";
import { expectClientAsBuild, render, routeError } from "../../tests/render.tsx";
import { drawRoute } from "../../tests/routed.tsx";
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

  // D428 and the plate's rebuild (D567): the plate has no crumb to the universe any more; its kicker names the place and its kind.
  test("has no crumb: the plate's kicker says Home, the general chat, and no link leads to the universe's cosmos", async () => {
    const html = await render(route("/net/:network/earth"), "/net/gnoland/earth");
    expect(html).not.toMatch(/<nav [^>]*aria-label="[^"]+"/);
    expect(html).not.toMatch(/<a [^>]*href="\/net\/gnoland\/"[^>]*>Universe<\/a>/);
    expect(html).toContain("Home · the general chat");
  });
});

// The browser serves the pages the build wrote, from the same data (F2208).
test("the browser's loader gives each pre-rendered earth what the build's does", () => {
  expectClientAsBuild("earth", clientLoader, loader);
});

// The Earth's page is a plate with no 3D whose blocks come in a chunk once the page has loaded: the build writes its frame and kicker, the
// rest is drawn after. jsdom lacks the browser's media query, observers and scene, which the page asks for: these stand in, for the whole
// file, as the route's own unmount still asks the scene for its media query.
const drawn = (path = "/net/:network/earth", at = "/net/onyx/earth") => {
  const sources = fakeStream();
  // The figure counts up only where motion is welcome: none here.
  noMedia();
  noObservers();
  const page = drawRoute({ path, Component: Earth, loader: clientLoader }, at);
  return { sources, ...page };
};
const plateOf = async (box: HTMLElement) => {
  await vi.waitFor(() => {
    expect(box.textContent).toContain("Countries are opt-in");
  });
  return box.querySelector("section[data-look='plate']");
};

describe("the Earth's plate", () => {
  test("is a plate named Earth, holding the one heading and the line of frame 40", async () => {
    const { box } = drawn();
    const plate = await plateOf(box);
    expect(plate?.getAttribute("aria-label")).toBe("Earth");
    expect(box.querySelectorAll("h1")).toHaveLength(1);
    expect(plate?.textContent).toContain("Where people speak from. Countries are opt-in.");
  });

  test("says hi in #general, and holds the three links out, each to its own tab", async () => {
    const { box } = drawn();
    const plate = await plateOf(box);
    expect(plate?.querySelector("a[href='#chat']")?.textContent).toBe("Say hi in #general");
    // The latest on X is the blog's card now (D13931), drawn only once a read of the chain has found posts: LatestOnX.test.tsx's.
    for (const [label, href] of [
      ["View on gnoweb", "https://onyx.testnets.gno.land"],
      ["Explorer", "https://gnoscan.io/?chainId=onyx-1"],
      ["Docs", "https://docs.gno.land/"],
    ] as const) {
      const link = plate?.querySelector(`a[href="${href}"]`);
      expect(link?.textContent, label).toBe(label);
      expect(link?.getAttribute("target"), label).toBe("_blank");
      expect(link?.getAttribute("rel"), label).toBe("noopener noreferrer");
    }
  });

  test("shows its vertical atlas caption to the eye only, and no figure the data does not hold", async () => {
    const { box } = drawn();
    const plate = await plateOf(box);
    const caption = plate?.querySelector("[data-caption]");
    expect(caption?.getAttribute("aria-hidden")).toBe("true");
    expect(caption?.textContent).toBe("gnoworld · hub atlas");
    expect(box.querySelector("canvas, video, picture, figure")).toBeNull();
    // Frame 26's planet thumbs are the only pictures, each decorative (its name sits beside it).
    for (const image of box.querySelectorAll("img")) expect(image.getAttribute("alt")).toBe("");
  });

  test("offers Follow and Share, as frame 86 draws them", async () => {
    const { box } = drawn();
    const plate = await plateOf(box);
    // In words, both (D13915 reverses D536's icons: what they did was unclear).
    expectFollowAndShare(plate);
  });
});

// Slice 9g (F5784, frame 38): the page follows the Earth's room once it has run. It asks no count of the room (presence=0, D384): the plate
// no longer draws the realms deployed in 24 h (D567's plate has no such square; the store still takes the stream's count).
describe("the Earth's page and the chain's stream", () => {
  test("follows #earth, for its events alone", async () => {
    const { sources } = drawn();
    await vi.waitFor(() => {
      expect(sources.opened.map(({ url }) => url)).toEqual(["/api/stream?rooms=%23earth&presence=0"]);
    });
  });

  test("closes the stream when the page is left", async () => {
    const { sources, leave } = drawn();
    await vi.waitFor(() => {
      expect(sources.opened).toHaveLength(1);
    });
    expect(sources.opened[0]?.closed).toBe(0);
    leave();
    expect(sources.opened[0]?.closed).toBe(1);
  });
});
