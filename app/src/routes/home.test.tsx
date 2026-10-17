import { expect, test } from "vitest";
import { render } from "../../tests/render.tsx";
import Home from "./home.tsx";

test("home links to each world by its name, at the world's path", async () => {
  const html = await render({ path: "/", Component: Home }, "/");
  expect(html).toContain("<h1>gno.world</h1>");
  expect(html).toContain('<a href="/w/bubble"');
  expect(html).toContain(">Bubble</a>");
});
