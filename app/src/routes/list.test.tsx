import type { RouteObject } from "react-router";
import { describe, expect, test } from "vitest";
import { render } from "../../tests/render.tsx";
import List, { meta } from "./list.tsx";

const route: RouteObject = { path: "/list", Component: List };

describe("the places' list page", () => {
  test("has one heading and lists the world of the data as a link to its page", async () => {
    const html = await render(route, "/list");
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toMatch(/<a [^>]*href="\/w\/bubble"[^>]*>(?:(?!<\/a>)[\s\S])*Bubble/);
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

describe("the list's page as a view", () => {
  test("shows the list as rows under the one heading, with no plate: the list is the whole page (frame 20's plate is for a place)", async () => {
    const html = await render(route, "/list");
    expect(html).not.toContain('data-look="plate"');
    expect(html).toMatch(/<h1\b[^>]*>Places<\/h1>/);
    expect(html).toMatch(/<[a-z]+ [^>]*data-look="[a-z]+"[^>]*>[\s\S]*Bubble/);
  });
});
