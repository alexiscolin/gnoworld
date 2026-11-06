import { describe, expect, it } from "vitest";
import { OnAir, XPosts } from "./feeds.ts";

// The team's hand-copied files (slice 8, 8i): what a row of xPosts.json and onAir.json may hold.
const post = (over: Record<string, unknown> = {}) => ({
  id: "p",
  handle: "@_gnoland",
  text: "Words.",
  at: "2026-11-03T10:00:00Z",
  link: "https://x.com/_gnoland/status/123",
  ...over,
});
const line = (over: Record<string, unknown> = {}) => ({
  id: "l",
  universe: "onyx",
  title: "Live",
  link: "https://gno.land/",
  ...over,
});

describe("xPosts.json", () => {
  it("takes a post with a handle, a date and a link to its status or the handle's page", () => {
    expect(XPosts.safeParse([post(), post({ id: "q", link: "https://x.com/_gnoland", sample: true })]).success).toBe(
      true,
    );
  });

  it("refuses a handle that is not an @ and one to fifteen word characters", () => {
    for (const handle of ["_gnoland", "@", "@sixteen_chars_xxx", "@bad-name", "@a b"]) {
      expect(XPosts.safeParse([post({ handle })]).success, handle).toBe(false);
    }
  });

  it("refuses a link whose host is not x.com, with a credential, or that is not https", () => {
    for (const link of [
      "https://twitter.com/_gnoland",
      "https://x.com.evil.example/_gnoland",
      "https://evil.example/https://x.com/a",
      "http://x.com/_gnoland",
      "https://user@x.com/_gnoland",
      "https://x.com/_gnoland/status/abc",
      "https://x.com/_gnoland/with/more",
    ]) {
      expect(XPosts.safeParse([post({ link })]).success, link).toBe(false);
    }
  });

  it("refuses a text of 281 characters, an empty one, a date that is not ISO, a `sample` that is false and an extra key", () => {
    expect(XPosts.safeParse([post({ text: "a".repeat(280) })]).success).toBe(true);
    for (const over of [
      { text: "a".repeat(281) },
      { text: "" },
      { at: "yesterday" },
      { sample: false },
      { extra: 1 },
    ]) {
      expect(XPosts.safeParse([post(over)]).success, JSON.stringify(over).slice(0, 30)).toBe(false);
    }
  });

  it("refuses two posts of one id", () => {
    expect(XPosts.safeParse([post(), post()]).success).toBe(false);
  });
});

describe("onAir.json", () => {
  it("takes a line leading to a world by its hub or to another site by its link, and an end date", () => {
    const rows = [line(), line({ id: "m", link: undefined, hub: "bubble", until: "2026-12-01T00:00:00Z" })];
    expect(OnAir.safeParse(rows).success).toBe(true);
  });

  it("refuses a line with both a hub and a link, or with neither", () => {
    expect(OnAir.safeParse([line({ hub: "bubble" })]).success).toBe(false);
    expect(OnAir.safeParse([line({ link: undefined })]).success).toBe(false);
  });

  it("refuses a link that is not https, a hub that is not a slug, and an `until` that is not a date", () => {
    for (const over of [
      { link: "http://gno.land/" },
      { link: "javascript:alert(1)" },
      { link: undefined, hub: "Not A Slug" },
      { until: "soon" },
    ]) {
      expect(OnAir.safeParse([line(over)]).success, JSON.stringify(over)).toBe(false);
    }
  });

  it("refuses an empty title, one past 120 characters and two lines of one id", () => {
    expect(OnAir.safeParse([line({ title: "a".repeat(120) })]).success).toBe(true);
    expect(OnAir.safeParse([line({ title: "" })]).success).toBe(false);
    expect(OnAir.safeParse([line({ title: "a".repeat(121) })]).success).toBe(false);
    expect(OnAir.safeParse([line(), line()]).success).toBe(false);
  });
});
