import { hubWorldOf } from "@gnoworld/core";
import { describe, expect, it } from "vitest";
import { mapNamesOf, worldOf } from "./space/planet/generated.ts";
import { pagePreloads, preloadTags, withPreloads } from "./preloads.ts";

const WORLDS =
  '<link rel="preload" href="/worlds.json" as="fetch" crossorigin="anonymous" media="not (max-width: 899px)"/>';

describe("the home's preloads", () => {
  it("name the cosmos Earth's maps at the widths it loads, hashed files", () => {
    const tags = preloadTags();
    for (const [name, width] of [
      ["earth-day", 2048],
      ["earth-night", 2048],
      ["clouds", 2048],
      ["moon", 1024],
    ] as const)
      expect(tags).toMatch(new RegExp(`href="/textures/${name}\\.${String(width)}\\.[0-9a-f]{8}\\.webp" as="fetch"`));
  });

  it("name no script: the scene's chunk stays off the first screen", () => {
    expect(preloadTags()).not.toContain('as="script"');
  });

  it("leave a phone alone: every tag is for a computer's width alone", () => {
    const tags = preloadTags().match(/<link [^>]*>/g) ?? [];
    expect(tags).toHaveLength(4);
    for (const tag of tags) expect(tag).toContain('media="not (max-width: 899px)"');
  });

  it("go beside the worlds file's preload, on the pages that have it alone", () => {
    const page = `<head>${WORLDS}<title>x</title></head>`;
    const done = withPreloads(page);
    expect(done.startsWith(`<head>${WORLDS}<link rel="preload" href="/textures/earth-day.2048.`)).toBe(true);
    expect(done.endsWith("<title>x</title></head>")).toBe(true);
    const other = "<head><title>y</title></head>";
    expect(withPreloads(other)).toBe(other);
  });

  it("put a page's own beside the head's end, where the home's worlds link is not", () => {
    const earth = pagePreloads("routes/earth", undefined);
    const page = "<head><title>x</title></head>";
    expect(withPreloads(page, earth)).toBe(`<head><title>x</title>${earth}</head>`);
  });
});

describe("the Earth's and a world's page preloads", () => {
  const hrefs = (tags: string) => [...tags.matchAll(/href="([^"]*)"/g)].map((match) => match[1]);

  it("name the worlds file alone for each universe's Earth: its 4096 maps would pass the 3 MB budget where the 3D never starts", () => {
    for (const id of ["routes/earth", "universe-earth"])
      expect(hrefs(pagePreloads(id, undefined))).toEqual(["/worlds.json"]);
  });

  it("name the worlds file and the maps the world's planet reads, from its hub's world", () => {
    const data = { slug: "bubble", realms: ["gno.land/r/bubble/x"] };
    const tags = pagePreloads("routes/world", data);
    const links = hrefs(tags);
    expect(links[0]).toBe("/worlds.json");
    const names = mapNamesOf(worldOf(hubWorldOf(data)));
    expect(names.length).toBeGreaterThan(0);
    expect(links).toHaveLength(names.length + 1);
    for (const name of names) expect(links.some((link) => link?.startsWith(`/textures/${name}.`))).toBe(true);
    expect(hrefs(pagePreloads("universe-world", data))).toEqual(links);
  });

  it("leave a phone alone, and every other page, and a world with no readable data", () => {
    for (const tag of pagePreloads("routes/earth", undefined).match(/<link [^>]*>/g) ?? [])
      expect(tag).toContain('media="not (max-width: 899px)"');
    for (const id of ["routes/home", "universe", "routes/list", "routes/realm"]) expect(pagePreloads(id, {})).toBe("");
    expect(pagePreloads("routes/world", { nope: 1 })).toBe("");
    expect(pagePreloads("routes/world", null)).toBe("");
  });
});
