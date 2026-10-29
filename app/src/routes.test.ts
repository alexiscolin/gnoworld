import type { RouteConfigEntry } from "@react-router/dev/routes";
import { expect, test } from "vitest";
import routes from "./routes.ts";

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
  ])
    expect(pairs, pair[0]).toContainEqual(pair);
  expect(routes[0]).toEqual(expect.objectContaining({ index: true, file: "routes/home.tsx" }));
  expect(routes.at(-1)).toEqual(expect.objectContaining({ path: "*", file: "routes/notFound.tsx" }));
});

test("no two routes share an id: a file at two paths is told apart", () => {
  const ids = routes.map((entry) => entry.id ?? entry.file);
  expect(new Set(ids).size).toBe(routes.length);
});
