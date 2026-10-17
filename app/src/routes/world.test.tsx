import { data, type ClientLoaderFunctionArgs, type MetaArgs, type RouteObject } from "react-router";
import { describe, expect, test } from "vitest";
import { render } from "../../tests/render.tsx";
import { findWorld, worldMeta } from "../site.ts";
import World, { clientLoader, ErrorBoundary, loader, meta } from "./world.tsx";

function page(path: string, worldLoader: RouteObject["loader"] = loader): Promise<string> {
  return render({ path: "/w/:world", Component: World, loader: worldLoader, ErrorBoundary }, path);
}

describe("a world's page", () => {
  test("shows the world's name and its description", async () => {
    const html = await page("/w/bubble");
    expect(html).toContain("<h1>Bubble</h1>");
    expect(html).toContain("the BUBBLE token, its governance");
  });

  test("shows not found, as an alert, for a world that does not exist", async () => {
    const html = await page("/w/nowhere");
    expect(html).toContain('role="alert"');
    expect(html).toContain("<h1>No world here</h1>");
    expect(html).toContain("<p>No world of gno.land goes by that name.</p>");
  });

  test.each([
    [
      "an error",
      () => {
        throw new Error("the chain did not answer");
      },
    ],
    [
      "an answer other than 404",
      () => {
        throw data(null, { status: 503 });
      },
    ],
  ])("says it could not load on %s, apart from not found", async (_, failing) => {
    const html = await page("/w/bubble", failing);
    expect(html).toContain('role="alert"');
    expect(html).toContain("<h1>This world could not load</h1>");
    expect(html).toContain("<p>Try again in a moment.</p>");
    expect(html).not.toContain("No world here");
  });

  test("carries the tags site.ts builds, for a world or for none", () => {
    const world = findWorld("bubble");
    const args = (loaderData: typeof world | undefined) => ({ loaderData }) as MetaArgs<typeof loader>;
    expect(meta(args(world))).toEqual(worldMeta(world));
    expect(meta(args(undefined))).toEqual(worldMeta(undefined));
  });

  test("finds a world in the browser as at build time, with no request", () => {
    const params = (world: string) => ({ params: { world } }) as unknown as ClientLoaderFunctionArgs;
    expect(clientLoader(params("bubble"))).toEqual(findWorld("bubble"));
    expect(() => clientLoader(params("nowhere"))).toThrow();
  });
});
