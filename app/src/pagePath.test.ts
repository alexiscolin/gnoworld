import { describe, expect, test } from "vitest";
import { isPagePath } from "./pagePath.ts";

// F326: the app's route test, handed to ui's link slot. The catch-all route answers every path with "No page here", so
// a path that names a file must not reach the router.
describe("isPagePath", () => {
  test.each([
    "/",
    "/list",
    "/earth",
    "/w/bubble",
    "/net/onyx/",
    "/net/gnoland/earth",
    "/w/bubble?room=a",
    "/w/bubble#top",
    "/w/bubble?room=a.b",
    "/list#v1.2",
    "/net/onyx/w/bubble?x=a.b",
    "/v1.2/x",
  ])("%s is a page", (path) => {
    expect(isPagePath(path)).toBe(true);
  });

  test.each([
    "/sitemap.xml",
    "/robots.txt",
    "/manifest.webmanifest",
    "/sw.js",
    "/icon.svg",
    "/assets/app-1a2b3c4d.js",
    "/sitemap.xml?from=footer",
    "/sitemap.xml#top",
    "/sitemap.xml?from=a/b",
  ])("%s is a file of the site, a plain anchor", (path) => {
    expect(isPagePath(path)).toBe(false);
  });
});
