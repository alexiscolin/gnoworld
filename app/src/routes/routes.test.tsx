import { renderToStaticMarkup } from "react-dom/server";
import {
  createStaticHandler,
  createStaticRouter,
  data,
  StaticRouterProvider,
  type ClientLoaderFunctionArgs,
  type MetaArgs,
  type RouteObject,
} from "react-router";
import { describe, expect, test } from "vitest";
import routes from "../routes.ts";
import { findWorld, homeMeta, worldMeta } from "../site.ts";
import Home, { meta as homePageMeta } from "./home.tsx";
import World, { clientLoader, ErrorBoundary, loader, meta as worldPageMeta } from "./world.tsx";

// Each route rendered as the build renders it, through React Router's own static rendering.
async function render(path: string, worldLoader: RouteObject["loader"] = loader): Promise<string> {
  const routes: RouteObject[] = [
    { path: "/", Component: Home },
    { path: "/w/:world", Component: World, loader: worldLoader, ErrorBoundary },
  ];
  const handler = createStaticHandler(routes);
  const context = await handler.query(new Request(`https://gno.world${path}`));
  if (context instanceof Response) throw new Error(`${path} answered ${String(context.status)}, not a page`);
  return renderToStaticMarkup(
    <StaticRouterProvider router={createStaticRouter(handler.dataRoutes, context)} context={context} />,
  );
}

describe("the routes", () => {
  test("home links to each world by its name", async () => {
    const html = await render("/");
    expect(html).toContain("<h1>gno.world</h1>");
    expect(html).toContain('<a href="/w/bubble"');
    expect(html).toContain(">Bubble</a>");
  });

  test("a world shows its name and its description", async () => {
    const html = await render("/w/bubble");
    expect(html).toContain("<h1>Bubble</h1>");
    expect(html).toContain("the BUBBLE token, its governance");
  });

  test("an unknown world shows not found, as an alert", async () => {
    const html = await render("/w/nowhere");
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
  ])("a world that fails with %s says it could not load, apart from not found", async (_, failing) => {
    const html = await render("/w/bubble", failing);
    expect(html).toContain('role="alert"');
    expect(html).toContain("<h1>This world could not load</h1>");
    expect(html).toContain("<p>Try again in a moment.</p>");
    expect(html).not.toContain("No world here");
  });
});

describe("the route modules", () => {
  test("list home at / and a world at /w/:world", () => {
    expect(routes).toEqual([
      expect.objectContaining({ index: true, file: "routes/home.tsx" }),
      expect.objectContaining({ path: "w/:world", file: "routes/world.tsx" }),
    ]);
  });

  test("give each page the tags its site.ts builds", () => {
    const world = findWorld("bubble");
    const args = (loaderData: typeof world | undefined) => ({ loaderData }) as MetaArgs<typeof loader>;
    expect(homePageMeta()).toEqual(homeMeta());
    expect(worldPageMeta(args(world))).toEqual(worldMeta(world));
    expect(worldPageMeta(args(undefined))).toEqual(worldMeta(undefined));
  });

  test("find a world in the browser as at build time, with no request", () => {
    const params = (world: string) => ({ params: { world } }) as unknown as ClientLoaderFunctionArgs;
    expect(clientLoader(params("bubble"))).toEqual(findWorld("bubble"));
    expect(() => clientLoader(params("nowhere"))).toThrow();
  });
});
