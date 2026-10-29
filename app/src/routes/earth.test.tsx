import { isRouteErrorResponse, type MetaArgs, type RouteObject } from "react-router";
import { describe, expect, test } from "vitest";
import { render, routeError } from "../../tests/render.tsx";
import Earth, { ErrorBoundary, loader, meta } from "./earth.tsx";

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
