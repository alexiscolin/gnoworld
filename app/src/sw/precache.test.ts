import { expect, test } from "vitest";
import { precached, precacheList } from "./precache.ts";

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

// The fonts too, so that offline the page keeps Geist (docs/plans/slice-2cd.md); nothing else.
test("the precache list holds the build's hashed fonts as well, and no other kind of file", () => {
  expect(
    precacheList([
      "assets/geist-latin-wght-normal-BgDaEnEv.woff2",
      "assets/geist-latin-wght-normal-BgDaEnEv.woff",
      "assets/planet-12345678.png",
      "assets/geist-latin-wght-normal-BgDaEnEv.woff2.map",
    ]),
  ).toEqual(["/assets/geist-latin-wght-normal-BgDaEnEv.woff2"]);
});

test("a font counts only by its whole name: no nested path, no hash under eight characters, no hash at all", () => {
  expect(
    precacheList([
      "assets/fonts/geist-latin-wght-normal-BgDaEnEv.woff2",
      "assets/geist-latin-wght-normal-BgDaEnE.woff2",
      "assets/geist-latin-wght-normal.woff2",
    ]),
  ).toEqual([]);
});

// The build's list carries each file's digest as the worker checks it: the first two are
// worker.test.ts's own, computed apart with Python for the bytes `build <path>`; node's agrees (F342).
test("lists each file with the digest the worker checks it by", async () => {
  const read = (name: string) => new TextEncoder().encode(`build /${name}`);
  expect(await precached(BUILD, read)).toEqual([
    {
      url: "/assets/entry.client-Bx3f9a1Q.js",
      integrity: "sha384-wCxJ9mRS38niqR1WkOqLCIps+SHWLy3826h9Brfdwa0Wj8hiGz44zwXOMa6RJAmL",
    },
    {
      url: "/assets/root-Dk2l0p9Z.css",
      integrity: "sha384-w9D2omtGrgbOEnFvsYsiOrormQx3OukSZ2noz7qIXEsy6wVLWVPCfZSGnR+mb3gH",
    },
    {
      url: "/assets/world-CwX_9-a2.js",
      integrity: "sha384-TLireZufnlbiW8ZybSSKVuibTvXBYC9j5W1ouDfp1Kp/JdNPP+8b1ZRLFlE69Mny",
    },
  ]);
});

test("the list is the same whatever order the build gives its files in", () => {
  expect(precacheList([...BUILD].reverse())).toEqual(precacheList(BUILD));
});
