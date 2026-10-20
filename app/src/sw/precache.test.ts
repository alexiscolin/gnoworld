import { expect, test } from "vitest";
import { precacheList } from "./precache.ts";

// The files a client build writes, as paths from its folder (no leading slash).
const BUILD = [
  "assets/entry.client-Bx3f9a1Q.js",
  "assets/root-Dk2l0p9Z.css",
  "assets/world-CwX_9-a2.js",
  "sw.js",
  "index.html",
  "w/bubble/index.html",
  "w/bubble.data",
  "__spa-fallback.html",
  "manifest.webmanifest",
  "icon-192.png",
  "assets/logo.svg",
  "assets/unhashed.js",
];

test("the precache list holds the build's hashed scripts and styles only, as the site's paths, sorted", () => {
  expect(precacheList(BUILD)).toEqual([
    "/assets/entry.client-Bx3f9a1Q.js",
    "/assets/root-Dk2l0p9Z.css",
    "/assets/world-CwX_9-a2.js",
  ]);
});

test("only whole names count: no source map, no nested path, no hash under eight characters", () => {
  expect(
    precacheList([
      "assets/entry.client-Bx3f9a1Q.js.map",
      "assets/root-Dk2l0p9Z.css.map",
      "x/assets/entry.client-Bx3f9a1Q.js",
      "assets/app-abc.js",
      "assets/app-1234567.js",
      "assets/app-12345678.js",
    ]),
  ).toEqual(["/assets/app-12345678.js"]);
});

// A hash is Vite's eight characters, dashes among them: a dashed name with none is not one.
test("a dashed name with no hash counts for nothing, its last words taken for no hash", () => {
  expect(precacheList(["assets/entry-client-chunk.js", "assets/route-world-main.css"])).toEqual([]);
});

test("the list is the same whatever order the build gives its files in", () => {
  expect(precacheList([...BUILD].reverse())).toEqual(precacheList(BUILD));
});
