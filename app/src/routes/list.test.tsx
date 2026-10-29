import type { RouteObject } from "react-router";
import { describe, expect, test } from "vitest";
import { render } from "../../tests/render.tsx";
import List, { meta } from "./list.tsx";

const route: RouteObject = { path: "/list", Component: List };

describe("the places' list page", () => {
  test("has one heading and lists the world of the data as a link to its page", async () => {
    const html = await render(route, "/list");
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toMatch(/<a [^>]*href="\/w\/bubble"[^>]*>Bubble<\/a>/);
  });

  test("shows no genre filter while the data holds no genre, and says nothing false about it", async () => {
    const html = await render(route, "/list");
    expect(html).not.toContain("aria-pressed");
  });

  test("carries its own title, and the canonical /net/onyx/list is not claimed: the list lives at /list", () => {
    const tags = meta();
    expect(JSON.stringify(tags)).toContain('"title":"Places · gno.world"');
    expect(tags).toEqual(
      expect.arrayContaining([expect.objectContaining({ rel: "canonical", href: "https://gno.world/list" })]),
    );
  });
});
