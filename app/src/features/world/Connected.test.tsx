// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Connected } from "./Connected.tsx";

// Slice 5j (frame 26): "CONNECTED WORLDS", one Row each with its PlanetThumb. Bubble is the only world and links to
// none, so the page shows no block; this component is proved by a planted list, never by sample data in the page.
const worlds = [
  { name: "Memba DAO", path: "/w/memba", line: "On chain · 96 calls a day" },
  { name: "Art Hall", path: "/w/art-hall", line: "Are here right now" },
];

describe("a world's connected worlds", () => {
  it("draws the heading and one row a world, each a link to the world's page", () => {
    const html = renderToStaticMarkup(<Connected worlds={worlds} />);
    expect(html).toMatch(/connected worlds/i);
    expect(html).toMatch(/<a [^>]*href="\/w\/memba"/);
    expect(html).toMatch(/<a [^>]*href="\/w\/art-hall"/);
    expect(html).toContain("On chain · 96 calls a day");
  });

  it("lays one divided row a world, each a link holding its thumb, which says nothing beside the name", () => {
    const page = new DOMParser().parseFromString(renderToStaticMarkup(<Connected worlds={worlds} />), "text/html");
    expect(page.querySelectorAll("[data-look='divided']")).toHaveLength(2);
    const links = [...page.querySelectorAll("a")];
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/w/memba", "/w/art-hall"]);
    for (const link of links) {
      const thumb = link.querySelector("span[data-kind='world']");
      expect(thumb?.querySelector("img")?.getAttribute("alt")).toBe("");
    }
  });

  it("draws nothing, not even the heading, with no connected world", () => {
    expect(renderToStaticMarkup(<Connected worlds={[]} />)).toBe("");
  });

  it("draws no pin and no button: the arrow is the link's own mark", () => {
    const html = renderToStaticMarkup(<Connected worlds={worlds} />);
    expect(html).not.toMatch(/<button/);
  });
});
