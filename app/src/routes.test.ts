import type { RouteConfigEntry } from "@react-router/dev/routes";
import { describe, expect, test, vi } from "vitest";
import { render } from "../tests/render.tsx";
import routes from "./routes.ts";
import Earth, { loader as earthLoader } from "./routes/earth.tsx";
import Home, { loader as homeLoader } from "./routes/home.tsx";
import List from "./routes/list.tsx";
import Realm, { clientLoader as realmLoader } from "./routes/realm.tsx";
import World, { loader as worldLoader } from "./routes/world.tsx";

const { useEntered } = vi.hoisted(() => ({ useEntered: vi.fn() }));
vi.mock(import("./features/universe/index.ts"), async (original) => ({ ...(await original()), useEntered }));
// A realm's view reads the chain once in the browser: its page alone is asked here.
vi.mock("./features/realms/index.ts", async (original) => ({
  ...(await original<typeof import("./features/realms/index.ts")>()),
  RealmView: () => null,
}));

// Every route with its whole path, nested or flat: [path, file].
function flat(entries: readonly RouteConfigEntry[], base = ""): [string, string][] {
  return entries.flatMap((entry) => {
    const here = [base, entry.path ?? ""].filter(Boolean).join("/");
    return [[here, entry.file] as [string, string], ...flat(entry.children ?? [], here)];
  });
}

test("each path of the site is drawn by its own file: home, the Earth, the list, a world, an ecosystem, each also under /net/:network", () => {
  const pairs = flat(routes);
  for (const pair of [
    ["earth", "routes/earth.tsx"],
    ["list", "routes/list.tsx"],
    ["w/:world", "routes/world.tsx"],
    ["e/:ecosystem", "routes/ecosystem.tsx"],
    ["net/:network", "routes/home.tsx"],
    ["net/:network/earth", "routes/earth.tsx"],
    ["net/:network/w/:world", "routes/world.tsx"],
    ["net/:network/e/:ecosystem", "routes/ecosystem.tsx"],
    ["r/*", "routes/realm.tsx"],
    ["net/:network/r/*", "routes/realm.tsx"],
  ])
    expect(pairs, pair[0]).toContainEqual(pair);
  expect(routes[0]).toEqual(expect.objectContaining({ index: true, file: "routes/home.tsx" }));
  expect(routes.at(-1)).toEqual(expect.objectContaining({ path: "*", file: "routes/notFound.tsx" }));
});

test("no two routes share an id: a file at two paths is told apart", () => {
  const ids = routes.map((entry) => entry.id ?? entry.file);
  expect(new Set(ids).size).toBe(routes.length);
});

// ADR-0003 §4: a reader is new until they enter a place. The pages that are places keep it, the Earth's, a world's and a realm's view, a
// world's page for one with no hub; the home and the list are none.
describe("the places a reader enters", () => {
  test.each([
    {
      page: "the Earth's",
      path: "/earth",
      route: { path: "/earth", Component: Earth, loader: earthLoader },
      enters: true,
    },
    {
      page: "a world's",
      path: "/w/bubble",
      route: { path: "/w/:world", Component: World, loader: worldLoader },
      enters: true,
    },
    {
      page: "a realm's view",
      path: "/r/gnoland/coins",
      route: { path: "/r/*", Component: Realm, loader: realmLoader },
      enters: true,
    },
    { page: "the home", path: "/", route: { path: "/", Component: Home, loader: homeLoader }, enters: false },
    { page: "the list", path: "/list", route: { path: "/list", Component: List }, enters: false },
  ])("$page page keeps that its reader entered a place, or not", async ({ path, route, enters }) => {
    useEntered.mockClear();
    await render(route, path);
    expect(useEntered.mock.calls.length > 0).toBe(enters);
  });
});
