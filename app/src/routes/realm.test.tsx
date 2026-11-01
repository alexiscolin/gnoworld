import type { MetaArgs, RouteObject } from "react-router";
import { describe, expect, test } from "vitest";
import { render, routeError } from "../../tests/render.tsx";
import { realmMeta } from "../meta.ts";
import { clientLoader, ErrorBoundary, meta } from "./realm.tsx";

const route = (path: string): RouteObject => ({
  path,
  loader: clientLoader,
  Component: () => <p>view</p>,
  ErrorBoundary,
});

describe("a realm's view", () => {
  test.each([
    ["/r/*", "/r/gnoland/coins"],
    ["/net/:network/r/*", "/net/gnoland/r/gnoland/wugnot"],
  ])("%s at %s loads the realm and its chain", async (pattern, path) => {
    expect(await render(route(pattern), path)).toContain("view");
  });

  test.each([
    ["/r/*", "/r/Demo/dao"],
    ["/r/*", "/r/demo/dao:vote"],
    ["/net/:network/r/*", "/net/nowhere/r/demo/dao"],
  ])("%s at %s answers 404 in the browser, as an alert", async (pattern, path) => {
    const html = await render(route(pattern), path);
    expect(html).toContain('role="alert"');
    expect(html).toMatch(/No realm here/);
    expect(await routeError(route(pattern), path)).toMatchObject({ status: 404 });
  });

  test("titles the view by the realm, unindexed, and a missing one as not found", () => {
    const found = clientLoader({ request: new Request("https://gno.world/r/gnoland/coins") });
    expect(meta({ loaderData: found } as unknown as MetaArgs<typeof clientLoader>)).toStrictEqual(
      realmMeta("gno.land/r/gnoland/coins"),
    );
    expect(realmMeta("gno.land/r/gnoland/coins")).toStrictEqual([
      { title: "gno.land/r/gnoland/coins · gno.world" },
      { name: "robots", content: "noindex" },
    ]);
    expect(realmMeta(undefined)).toStrictEqual([
      { title: "No realm here · gno.world" },
      { name: "robots", content: "noindex" },
    ]);
  });

  test("throws a 404 for a path that names no realm", () => {
    let thrown: unknown;
    try {
      clientLoader({ request: new Request("https://gno.world/r/") });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({ init: { status: 404 } });
  });
});
