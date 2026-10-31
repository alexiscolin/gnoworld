import { isRouteErrorResponse, type MetaArgs, type RouteObject } from "react-router";
import { describe, expect, test } from "vitest";
import { expectClientAsBuild, render, routeError } from "../../tests/render.tsx";
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

  test("lists the worlds of its universe, and only those", async () => {
    const onyx = await render(route("/net/:network/earth"), "/net/onyx/earth");
    expect(onyx).toMatch(/<a [^>]*href="\/w\/bubble"[^>]*>Bubble<\/a>/);
    const other = await render(route("/net/:network/earth"), "/net/gnoland/earth");
    expect(other).not.toContain("Bubble");
  });

  test("says plainly that its universe holds no world, and invents none", async () => {
    const html = await render(route("/net/:network/earth"), "/net/gnoland/earth");
    expect(html).toMatch(/no world yet/i);
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

  test("has a trail from the home to the Earth, which is the current page", async () => {
    const html = await render(route("/net/:network/earth"), "/net/gnoland/earth");
    expect(html).toMatch(/<nav [^>]*aria-label="[^"]+"/);
    expect(html).toMatch(/<a [^>]*href="\/net\/gnoland\/"[^>]*>gno\.land<\/a>/);
    expect(html).toMatch(/aria-current="page"[^>]*>Earth</);
  });
});

// The browser serves the pages the build wrote, from the same data (F2208).
test("the browser's loader gives each pre-rendered earth what the build's does", () => {
  expectClientAsBuild("earth", clientLoader, loader);
});

// Slice 5r (frames 37 to 42): the Earth's page is a plate, with no 3D.
describe("the Earth's plate", () => {
  test("is a plate named Earth, holding the one heading and the worlds' links", async () => {
    const html = await render({ path: "/earth", Component: Earth, loader }, "/earth");
    const plate = /<section [^>]*data-look="plate"[^>]*>/.exec(html)?.[0] ?? "";
    expect(plate).toContain('aria-label="Earth"');
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toMatch(/<a [^>]*href="\/w\/bubble"/);
  });

  test("shows its vertical atlas caption to the eye only, and no figure the data does not hold", async () => {
    const html = await render({ path: "/earth", Component: Earth, loader }, "/earth");
    expect(html).toContain("gnoworld");
    expect(html).toMatch(/aria-hidden="true"[^>]*><p [^>]*>gnoworld/);
    expect(html).not.toMatch(/<(canvas|img|video|picture|figure)\b/i);
  });

  test("offers neither Follow nor Share: nothing behind them yet", async () => {
    const html = await render({ path: "/earth", Component: Earth, loader }, "/earth");
    expect(html).not.toMatch(/>Follow<|>Share</);
  });
});
