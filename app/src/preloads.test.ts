import { describe, expect, it } from "vitest";
import { preloadTags, withPreloads } from "./preloads.ts";

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
});
