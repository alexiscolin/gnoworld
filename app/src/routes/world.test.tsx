import { data, type ClientLoaderFunctionArgs, type MetaArgs, type RouteObject } from "react-router";
import { describe, expect, test } from "vitest";
import { BACK_HOME, alertOf, render, routeError } from "../../tests/render.tsx";
import { failedWorldMeta, worldMeta } from "../meta.ts";
import { findWorld } from "../worlds.ts";
import World, { clientLoader, ErrorBoundary, loader, meta } from "./world.tsx";

function route(worldLoader: RouteObject["loader"] = loader): RouteObject {
  return { path: "/w/:world", Component: World, loader: worldLoader, ErrorBoundary };
}

function metaArgs(loaderData: ReturnType<typeof findWorld> | undefined, error?: unknown) {
  return { loaderData, error } as MetaArgs<typeof loader>;
}

const failures: [string, () => never][] = [
  [
    "an error",
    () => {
      throw new Error("the chain did not answer");
    },
  ],
  ...[403, 410, 503].map((status): [string, () => never] => [
    `an answer of ${String(status)}`,
    () => {
      throw data(null, { status });
    },
  ]),
];

describe("a world's page", () => {
  test("shows the world's name and its description", async () => {
    const html = await render(route(), "/w/bubble");
    expect(html).toContain("<h1>Bubble</h1>");
    expect(html).toContain("the BUBBLE token, its governance");
  });

  // The chat's rooms come from the server once the page runs: the build writes the page waiting for them.
  test("holds the world's chat, its rooms still to load", async () => {
    const html = await render(route(), "/w/bubble");
    expect(html).toMatch(/<p role="status">Loading the rooms…<\/p>/);
  });

  test("shows not found, as an alert, for a world that does not exist", async () => {
    const html = await render(route(), "/w/nowhere");
    expect(html).toContain('role="alert"');
    expect(html).toContain("<h1>No world here</h1>");
    expect(html).toContain("<p>No world of gno.land goes by that name.</p>");
    expect(alertOf(html)).toMatch(BACK_HOME);
  });

  test.each(failures)("says it could not load on %s, apart from not found", async (_, failing) => {
    const html = await render(route(failing), "/w/bubble");
    expect(html).toContain('role="alert"');
    expect(html).toContain("<h1>This world could not load</h1>");
    expect(html).toContain("<p>Try again in a moment.</p>");
    expect(alertOf(html)).toMatch(BACK_HOME);
    expect(html).not.toContain("No world here");
  });

  // The app may be what failed: the way home loads the document again (F325).
  test.each(failures)("goes home by loading the document again on %s", async (_, failing) => {
    const html = await render(route(failing), "/w/bubble", { slot: true });
    expect(alertOf(html)).toMatch(BACK_HOME);
    expect(alertOf(html)).not.toContain("data-routed");
  });

  test("goes home through the router from a world that does not exist", async () => {
    expect(alertOf(await render(route(), "/w/nowhere", { slot: true }))).toContain('data-routed=""');
  });

  test("carries a world's tags, or not found's when no world has the name", async () => {
    const world = findWorld("bubble");
    expect(meta(metaArgs(world))).toEqual(worldMeta(world));
    expect(meta(metaArgs(undefined, await routeError(route(), "/w/nowhere")))).toEqual(worldMeta(undefined));
  });

  test.each(failures)("carries could-not-load tags on %s, not not-found ones", async (_, failing) => {
    const error = await routeError(route(failing), "/w/bubble");
    expect(meta(metaArgs(undefined, error))).toEqual(failedWorldMeta());
  });

  test("finds a world in the browser as at build time, with no request", () => {
    const params = (world: string) => ({ params: { world } }) as unknown as ClientLoaderFunctionArgs;
    expect(clientLoader(params("bubble"))).toEqual(findWorld("bubble"));
    expect(() => clientLoader(params("nowhere"))).toThrow();
  });

  // Any throw passed the case above; only React Router's 404 selects the not-found page (F382).
  test("throws React Router's 404 in the browser for a world that does not exist", () => {
    const params = { params: { world: "nowhere" } } as unknown as ClientLoaderFunctionArgs;
    expect(() => clientLoader(params)).toThrow(expect.objectContaining({ init: { status: 404 } }));
  });
});
