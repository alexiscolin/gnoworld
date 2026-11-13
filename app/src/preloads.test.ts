import { hubWorldOf } from "@gnoworld/core";
import { describe, expect, it } from "vitest";
import { mapNamesOf, worldOf } from "./space/planet/generated.ts";
import { documentPreloads, pagePreloads, preloadTags, withPreloads } from "./preloads.ts";

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

  it("go at the head's end, as a page's own, and a page with none is as it was", () => {
    const page = "<head><title>x</title></head>";
    const own = pagePreloads("routes/home", {});
    expect(withPreloads(page, own)).toBe(`<head><title>x</title>${own}</head>`);
    expect(withPreloads(page)).toBe(page);
  });

  it("name the worlds file with the maps, on the home, a universe's, the cosmos and a system, and in the HTML alone: a route's links would ask again on a client navigation", async () => {
    for (const id of ["routes/home", "cosmos-universe", "cosmos-system"])
      expect(pagePreloads(id, {})).toBe(WORLDS + preloadTags());
    expect(pagePreloads("universe", { isDefault: true })).toBe(WORLDS + preloadTags());
    expect(Reflect.has(await import("./routes/home.tsx"), "links")).toBe(false);
  });

  it("name nothing on another universe's home, which draws no space", () => {
    expect(pagePreloads("universe", { isDefault: false })).toBe("");
    expect(pagePreloads("universe", {})).toBe("");
  });

  it("name nothing in the fallback page the host serves every page not written ahead: it is built from the home's route", () => {
    const page = (isSpaMode: boolean) => ({
      isSpaMode,
      staticHandlerContext: { matches: [{ route: { id: "root" } }, { route: { id: "routes/home" } }], loaderData: {} },
    });
    expect(documentPreloads(page(true))).toBe("");
    expect(documentPreloads(page(false))).toBe(WORLDS + preloadTags());
  });
});

describe("the Earth's and a world's page preloads", () => {
  const hrefs = (tags: string) => [...tags.matchAll(/href="([^"]*)"/g)].map((match) => match[1]);

  it("name the worlds file and the first-frame maps for each universe's Earth: its planet is built from them", () => {
    for (const id of ["routes/earth", "universe-earth"])
      expect(hrefs(pagePreloads(id, undefined))).toEqual(["/worlds.json", ...hrefs(preloadTags())]);
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
    for (const id of ["routes/list", "routes/realm"]) expect(pagePreloads(id, {})).toBe("");
    expect(pagePreloads("routes/world", { nope: 1 })).toBe("");
    expect(pagePreloads("routes/world", null)).toBe("");
  });
});
