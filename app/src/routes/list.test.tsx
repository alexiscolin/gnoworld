import type { RouteObject } from "react-router";
import { describe, expect, test } from "vitest";
import { render } from "../../tests/render.tsx";
import List, { meta } from "./list.tsx";

const route: RouteObject = { path: "/list", Component: List };

describe("the places' list page, which is the search palette's address (D355)", () => {
  test("draws no page of its own: it goes to the home with the palette asked open", async () => {
    const html = await render(route, "/list");
    expect(html).not.toContain("<h1");
    expect(html).not.toContain('aria-label="Places"');
  });

  test("is titled Places, never indexed, and claims no canonical address", () => {
    const tags = meta();
    expect(JSON.stringify(tags)).toContain('"title":"Places · gno.world"');
    expect(tags).toEqual(expect.arrayContaining([{ name: "robots", content: "noindex" }]));
    expect(JSON.stringify(tags)).not.toContain("canonical");
  });
});
