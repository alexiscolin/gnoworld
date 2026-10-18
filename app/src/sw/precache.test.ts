import { expect, test } from "vitest";
import { cacheVersion, precacheList } from "./precache.ts";

// The file names a client build writes, as Vite's bundle keys them (no leading slash).
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

test("the list is the same whatever order the build gives its files in", () => {
  expect(precacheList([...BUILD].reverse())).toEqual(precacheList(BUILD));
});

test("the version follows the list: the same list, the same version; another list, another", () => {
  const list = precacheList(BUILD);
  expect(cacheVersion(list)).toBe(cacheVersion([...list]));
  expect(cacheVersion(list)).toMatch(/^[0-9a-f]{8}$/);
  expect(cacheVersion(list.slice(1))).not.toBe(cacheVersion(list));
  expect(cacheVersion(["/assets/a-AAAAAAAA.js"])).not.toBe(cacheVersion(["/assets/a-AAAAAAAB.js"]));
  expect(cacheVersion(["/a", "/b"])).not.toBe(cacheVersion(["/a\n/b"]));
});
