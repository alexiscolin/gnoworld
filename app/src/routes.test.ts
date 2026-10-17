import { expect, test } from "vitest";
import routes from "./routes.ts";

test("the routes are home at /, a world at /w/:world, and not found everywhere else", () => {
  expect(routes).toEqual([
    expect.objectContaining({ index: true, file: "routes/home.tsx" }),
    expect.objectContaining({ path: "w/:world", file: "routes/world.tsx" }),
    expect.objectContaining({ path: "*", file: "routes/notFound.tsx" }),
  ]);
});
