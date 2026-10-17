import { describe, expect, test } from "vitest";
import { render } from "../../tests/render.tsx";
import { homeMeta } from "../site.ts";
import Home, { meta } from "./home.tsx";

describe("home", () => {
  test("links to each world by its name", async () => {
    const html = await render({ path: "/", Component: Home }, "/");
    expect(html).toContain("<h1>gno.world</h1>");
    expect(html).toContain('<a href="/w/bubble"');
    expect(html).toContain(">Bubble</a>");
  });

  test("carries the tags site.ts builds for it", () => {
    expect(meta()).toEqual(homeMeta());
  });
});
