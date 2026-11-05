// @vitest-environment jsdom
import { hubWorldOf } from "@gnoworld/core";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { all, mount as draw, one, settled } from "../../../tests/mount.tsx";
import { worldThumb } from "../../lib/worldThumb.ts";
import { Worlds } from "./Worlds.tsx";

// 5q: the full-screen chat's column of worlds (the video's left edge): one planet each, the world in view marked.
const BUBBLE = { slug: "bubble", name: "Bubble", href: "/w/bubble" };
const GOVDAO = { slug: "govdao", name: "GovDAO", href: "/w/govdao" };

// A world is a link of the router's, so the column is drawn inside one.
const mount = (element: React.ReactElement) => draw(<MemoryRouter>{element}</MemoryRouter>);

describe("Worlds", () => {
  it("is a navigation named Worlds, one link to each world's page, named by the world", () => {
    const nav = one(mount(<Worlds worlds={[BUBBLE, GOVDAO]} current="bubble" />), 'nav[aria-label="Worlds"]');
    const links = all(nav, "a");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/w/bubble", "/w/govdao"]);
    expect(links.map((link) => link.getAttribute("aria-label"))).toEqual(["Bubble", "GovDAO"]);
  });

  it("draws each world as ui's own disc, the picture saying nothing more than the link's name", () => {
    const box = mount(<Worlds worlds={[BUBBLE, GOVDAO]} current="bubble" />);
    const pictures = all(box, "img");
    expect(pictures.map((picture) => picture.getAttribute("src")?.startsWith("data:image/svg+xml"))).toEqual([
      true,
      true,
    ]);
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

// Alexis 2026-11-06: the column drew every world with the same planet, and no name.
describe("Worlds, each its own planet", () => {
  // The pictures' code is asked as the column is drawn: the test waits for the chunk's own pictures.
  const sources = async (worlds: React.ComponentProps<typeof Worlds>["worlds"]) => {
    const box = mount(<Worlds worlds={worlds} current="bubble" />);
    const own = () => all(box, "img").every((picture) => picture.getAttribute("src")?.includes("clipPath") === true);
    await settled(own);
    return all(box, "img").map((picture) => picture.getAttribute("src"));
  };

  it("draws two worlds with two pictures, and one world with the same picture each time", async () => {
    const [bubble, govdao] = await sources([BUBBLE, GOVDAO]);
    expect(bubble).not.toBe(govdao);
    expect((await sources([BUBBLE]))[0]).toBe(bubble);
  });

  it("draws a world with a realm as the world of its first realm, not of its slug", async () => {
    const realm = { slug: "x", name: "X", href: "/w/x", realms: ["gno.land/r/gov/dao"] };
    const [picture] = await sources([realm]);
    expect(picture).toBe(worldThumb(hubWorldOf(realm)));
    expect(picture).not.toBe(worldThumb("x"));
  });

  it("writes each world's name in its row, the picture beside it saying nothing", () => {
    const box = mount(<Worlds worlds={[BUBBLE, GOVDAO]} current="bubble" />);
    expect(all(box, "a").map((link) => link.textContent)).toEqual(["Bubble", "GovDAO"]);
    expect(all(box, "img").map((picture) => picture.getAttribute("alt"))).toEqual(["", ""]);
  });

  it("keeps ui's disc and the name where the pictures' code cannot come, and never throws", async () => {
    vi.resetModules();
    vi.doMock("./thumbsChunk.ts", () => ({ thumbsChunk: () => Promise.reject(new Error("offline")) }));
    const { Worlds: Offline } = await import("./Worlds.tsx");
    const box = mount(<Offline worlds={[BUBBLE, GOVDAO]} current="bubble" />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(all(box, "a").map((link) => link.textContent)).toEqual(["Bubble", "GovDAO"]);
    expect(all(box, "[data-fallback]")).toHaveLength(2);
    vi.doUnmock("./thumbsChunk.ts");
  });
});
