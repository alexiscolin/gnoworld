import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { latestPost } from "./blog.ts";

// gno.land's blog page (D13931): the page recorded through gnomcp from gnoland-1, the posts' titles, slugs and days, and the newest one picked.
const RECORDED = readFileSync(new URL("../../../tests/chain/recorded/gnoland-1-blog-home.md", import.meta.url), "utf8");
const entry = (title: string, slug: string, day: string) => `### [${title}](/r/gnoland/blog:p/${slug})\n${day}\n`;

describe("latestPost", () => {
  it("reads the newest post of the recorded page: title, slug and day", () => {
    expect(latestPost(RECORDED)).toEqual({
      title: "Gno.land Mainnet Upgraded to v1.7.0",
      slug: "mainnet-upgrade",
      date: "2026-10-30",
    });
  });

  it("takes the newest day whatever the order of the page", () => {
    const page =
      entry("Old", "old", "05 May 2025") + entry("New", "new", "9 Jun 2026") + entry("Mid", "mid", "01 Jan 2026");
    expect(latestPost(page)?.slug).toBe("new");
  });

  it("gives nothing for a page with no post, an empty one or the realm's own 'No posts.'", () => {
    for (const page of ["", "No posts.", "# Gno.land's blog\n"]) expect(latestPost(page), page).toBeUndefined();
  });

  it("refuses a post whose slug is no slug, whose day is no day or whose title hides a character", () => {
    for (const bad of [
      entry("T", "a/../b", "30 Oct 2026"),
      entry("T", "UP", "30 Oct 2026"),
      entry("T", "a", "31 Feb 2026"),
      entry("T", "a", "30 Foo 2026"),
      entry("T", "a", "yesterday"),
      entry("Evil\u202Etitle", "a", "30 Oct 2026"),
      entry("Zero\u200Bwidth", "a", "30 Oct 2026"),
      entry("", "a", "30 Oct 2026"),
      entry("x".repeat(121), "a", "30 Oct 2026"),
    ])
      expect(latestPost(bad), bad).toBeUndefined();
  });

  it("skips a refused post and shows the next good one, never a half-read one", () => {
    const page = entry("Bad\u202E", "bad", "30 Oct 2026") + entry("Good", "good", "29 Sep 2026");
    expect(latestPost(page)?.slug).toBe("good");
  });
});
