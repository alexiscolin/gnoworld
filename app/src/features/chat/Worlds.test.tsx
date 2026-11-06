// @vitest-environment jsdom
import { hubWorldOf } from "@gnoworld/core";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { act } from "react";
import { all, mount as draw, one, settled } from "../../../tests/mount.tsx";
import { pictureOf } from "../../lib/worldPictures.ts";
import { inRailOrder, Worlds } from "./Worlds.tsx";

// 5q: the full-screen chat's column of worlds (the video's left edge): one planet each, the world in view marked.
const BUBBLE = { slug: "bubble", name: "Bubble", href: "/w/bubble" };
const GOVDAO = { slug: "govdao", name: "GovDAO", href: "/w/govdao", realms: ["gno.land/r/gov/dao"] };
const EARTH = { slug: "earth", name: "Earth", href: "/earth" };
// A world no picture was taken of: ui's disc stands in.
const UNSEEN = { slug: "zz-unseen", name: "Unseen", href: "/w/zz-unseen" };

// A world is a link of the router's, so the column is drawn inside one.
const mount = (element: React.ReactElement) => draw(<MemoryRouter>{element}</MemoryRouter>);

describe("Worlds", () => {
  it("is a navigation named Worlds, one link to each world's page, named by the world", () => {
    const nav = one(mount(<Worlds worlds={[BUBBLE, GOVDAO]} current="bubble" />), 'nav[aria-label="Worlds"]');
    const links = all(nav, "a");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/w/bubble", "/w/govdao"]);
    expect(links.map((link) => link.getAttribute("aria-label"))).toEqual(["Bubble", "GovDAO"]);
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

// Alexis 2026-11-06: each world shows the picture taken of its real planet, 44 px, with its name on hover only.
describe("Worlds, the pictures of the real planets", () => {
  it("draws one picture to a world from the manifest, the Earth first, each its own", () => {
    const box = mount(<Worlds worlds={[EARTH, BUBBLE, GOVDAO]} current="earth" />);
    const sources = all(box, "img").map((picture) => picture.getAttribute("src"));
    expect(sources).toEqual([pictureOf("earth"), pictureOf("bubble"), pictureOf("gov/dao")]);
    expect(new Set(sources).size).toBe(3);
    expect(sources.every((src) => src?.startsWith("/world-pictures/") === true)).toBe(true);
  });

  it("draws a world with a realm as the world of its first realm, not of its slug", () => {
    const [picture] = all(mount(<Worlds worlds={[GOVDAO]} current="x" />), "img");
    expect(picture?.getAttribute("src")).toBe(pictureOf(hubWorldOf(GOVDAO)));
    expect(picture?.getAttribute("src")).not.toBe(pictureOf("govdao"));
  });

  it("loads each lazily at its own size, saying nothing: the link names it", () => {
    const [picture] = all(mount(<Worlds worlds={[EARTH]} current="earth" />), "img");
    expect(picture?.getAttribute("loading")).toBe("lazy");
    expect(picture?.getAttribute("decoding")).toBe("async");
    expect(picture?.getAttribute("width")).toBe("44");
    expect(picture?.getAttribute("height")).toBe("44");
    expect(picture?.getAttribute("alt")).toBe("");
  });

  it("keeps ui's disc for a world with no picture", () => {
    const box = mount(<Worlds worlds={[UNSEEN, EARTH]} current="earth" />);
    expect(all(box, "[data-fallback]")).toHaveLength(1);
    expect(one(box, "[data-fallback] img").getAttribute("src")?.startsWith("data:image/svg+xml")).toBe(true);
  });

  it("writes no text in a row: the name is the link's accessible name", () => {
    const box = mount(<Worlds worlds={[EARTH, BUBBLE]} current="earth" />);
    expect(all(box, "a").map((link) => link.getAttribute("aria-label"))).toEqual(["Earth", "Bubble"]);
    for (const link of all(box, "a")) expect(link.textContent).toBe("");
  });

  it("shows the name on hover, in the design system's tooltip", async () => {
    const box = mount(<Worlds worlds={[EARTH]} current="x" />);
    const tip = one(box, "[popover]");
    expect(tip.textContent).toBe("Earth");
    expect(tip.dataset["shown"]).toBe("false");
    act(() => {
      one(box, "a").dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
    });
    await settled(() => tip.dataset["shown"] === "true");
    expect(tip.dataset["shown"]).toBe("true");
  });
});

// Alexis 2026-11-06: one order for both columns, the universe's rail's: the Earth, the worlds followed, the rest.
describe("inRailOrder", () => {
  const slugs = (list: readonly { slug: string }[]) => list.map(({ slug }) => slug);
  const ZENAO = { slug: "zenao", name: "Zenao", href: "/w/zenao" };

  it("puts the Earth first, then the followed worlds, the last followed first, then the rest as listed", () => {
    const listed = [BUBBLE, GOVDAO, ZENAO, EARTH];
    expect(slugs(inRailOrder(listed, []))).toEqual(["earth", "bubble", "govdao", "zenao"]);
    expect(slugs(inRailOrder(listed, ["zenao", "bubble"]))).toEqual(["earth", "zenao", "bubble", "govdao"]);
  });

  it("reads a followed world by its id, the world of its first realm", () => {
    expect(slugs(inRailOrder([BUBBLE, GOVDAO], [hubWorldOf(GOVDAO)]))).toEqual(["govdao", "bubble"]);
  });

  it("draws the column in that order", () => {
    const box = mount(<Worlds worlds={[BUBBLE, EARTH, ZENAO]} current="earth" followed={["zenao"]} />);
    expect(all(box, "a").map((link) => link.getAttribute("aria-label"))).toEqual(["Earth", "Zenao", "Bubble"]);
  });
});
