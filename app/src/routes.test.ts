import { expect, test } from "vitest";
import routes from "./routes.ts";

test("the routes are home at / and a world at /w/:world", () => {
  expect(routes).toEqual([
    expect.objectContaining({ index: true, file: "routes/home.tsx" }),
    expect.objectContaining({ path: "w/:world", file: "routes/world.tsx" }),
  ]);
});
