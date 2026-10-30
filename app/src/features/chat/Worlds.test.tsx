// @vitest-environment jsdom
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { all, mount as draw, one } from "../../../tests/mount.tsx";
import { Worlds } from "./Worlds.tsx";

// 5q: the full-screen chat's column of worlds (the video's left edge): one planet each, the world in view marked.
const BUBBLE = { slug: "bubble", name: "Bubble", href: "/w/bubble", src: "/planets/bubble.webp" };
const GOVDAO = { slug: "govdao", name: "GovDAO", href: "/w/govdao", src: "/planets/govdao.webp" };

// A world is a link of the router's, so the column is drawn inside one.
const mount = (element: React.ReactElement) => draw(<MemoryRouter>{element}</MemoryRouter>);

describe("Worlds", () => {
  it("is a navigation named Worlds, one link to each world's page, named by the world", () => {
    const nav = one(mount(<Worlds worlds={[BUBBLE, GOVDAO]} current="bubble" />), 'nav[aria-label="Worlds"]');
    const links = all(nav, "a");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/w/bubble", "/w/govdao"]);
    expect(links.map((link) => link.getAttribute("aria-label"))).toEqual(["Bubble", "GovDAO"]);
  });

  it("draws each world as its planet's picture in a disc, the picture saying nothing more than the link's name", () => {
    const box = mount(<Worlds worlds={[BUBBLE, GOVDAO]} current="bubble" />);
    const pictures = all(box, "img");
    expect(pictures.map((picture) => picture.getAttribute("src"))).toEqual([BUBBLE.src, GOVDAO.src]);
    expect(pictures.map((picture) => picture.getAttribute("alt"))).toEqual(["", ""]);
    expect(all(box, "[data-kind='world']")).toHaveLength(2);
  });

  it("marks the world in view as the current page, and no other", () => {
    const box = mount(<Worlds worlds={[BUBBLE, GOVDAO]} current="govdao" />);
    expect(one(box, 'a[aria-label="GovDAO"]').getAttribute("aria-current")).toBe("page");
    expect(one(box, 'a[aria-label="Bubble"]').getAttribute("aria-current")).toBeNull();
  });

  it("shows one planet for one world, and nothing invented beside it", () => {
    expect(all(mount(<Worlds worlds={[BUBBLE]} current="bubble" />), "a")).toHaveLength(1);
  });
});
