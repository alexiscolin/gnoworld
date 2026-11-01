import { expect, test, vi } from "vitest";
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
  "icon.svg",
  "_headers",
];

// ADR-0001 §12 nuanced by Alexis's 2026-10-18 decision (F175): the shell is cached too, so a new tab opens
// the version before the click, and the app opens with no network.
test("the precache list holds the build's hashed files and its shell, as the site's paths, sorted", () => {
  expect(precacheList(BUILD)).toEqual([
    "/",
    "/__spa-fallback.html",
    "/assets/entry.client-Bx3f9a1Q.js",
    "/assets/root-Dk2l0p9Z.css",
    "/assets/world-CwX_9-a2.js",
    "/icon.svg",
    "/manifest.webmanifest",
    "/w/bubble",
    "/w/bubble.data",
  ]);
});

// ADR-0002 §8, row 10: nothing of three loads on a phone before "View in space", and the worker runs on a phone too.
test("the scene's chunk stays out of the list: the worker would fetch it for a phone that never asked", () => {
  expect(precacheList(["assets/scene-Bx3f9a1Q.js", "assets/scene-CwX_9-a2.js"])).toEqual([]);
});

test("only the scene's own chunk stays out: a name that holds the word is precached", () => {
  expect(precacheList(["assets/sceneries-Bx3f9a1Q.js", "assets/Hero-scene-CwX_9-a2.js"])).toEqual([
    "/assets/Hero-scene-CwX_9-a2.js",
    "/assets/sceneries-Bx3f9a1Q.js",
  ]);
});

test("a page is its folder's index.html at the folder's path; the home is the root", () => {
  expect(precacheList(["index.html", "w/bubble/index.html", "a/b/c/index.html"])).toEqual(["/", "/a/b/c", "/w/bubble"]);
});

test("of the pages, the build's own only: no other html, no index of the assets, no map, no script", () => {
  expect(
    precacheList([
      "other.html",
      "w/bubble/other.html",
      "assets/index.html",
      "assets/page-AAAAAAAA.html",
      "index.html.map",
      "w/bubble/index.html.gz",
      "sw.js",
      "_headers",
      "icon-192.png",
      "icon-512.png",
      "icon-maskable-512.png",
    ]),
  ).toEqual([]);
});

test("a data file counts where it sits, and one under assets or with another ending counts for nothing", () => {
  expect(precacheList(["w/bubble.data", "_root.data", "assets/x.data", "w/bubble.data.map", "w/data"])).toEqual([
    "/_root.data",
    "/w/bubble.data",
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

// Offline, latin text keeps Geist; other scripts fall back to the system's font, 94 KB lighter (F292).
test("of the fonts, the latin faces only: the text's and the code's", () => {
  expect(
    precacheList([
      "assets/geist-latin-wght-normal-BgDaEnEv.woff2",
      "assets/geist-mono-latin-wght-normal-XN7g48iV.woff2",
      "assets/geist-latin-ext-wght-normal-DC-KSUi6.woff2",
      "assets/geist-cyrillic-wght-normal-BEAKL7Jp.woff2",
      "assets/geist-mono-vietnamese-wght-normal-DadHysG0.woff2",
      "assets/geist-mono-symbols2-wght-normal-CO5SzqOn.woff2",
      "assets/geist-mono-latin-ext-wght-normal-Bwz-egvJ.woff2",
      "assets/inter-latin-wght-normal-AAAAAAAA.woff2",
    ]),
  ).toEqual(["/assets/geist-latin-wght-normal-BgDaEnEv.woff2", "/assets/geist-mono-latin-wght-normal-XN7g48iV.woff2"]);
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

// The build's list carries each file's digest as the worker checks it: the assets' are worker.test.ts's own,
// computed apart with Python for the bytes `build <path>`; node's agrees (F342). A page's bytes are its file's.
test("lists each file with the digest the worker checks it by, a page's from its html file", async () => {
  const read = (name: string) => new TextEncoder().encode(`build /${name}`);
  const listed = await precached(["index.html", "w/bubble/index.html", ...BUILD.slice(0, 3)], read);
  expect(listed.map(({ url }) => url)).toEqual([
    "/",
    "/assets/entry.client-Bx3f9a1Q.js",
    "/assets/root-Dk2l0p9Z.css",
    "/assets/world-CwX_9-a2.js",
    "/w/bubble",
  ]);
  expect(listed.find(({ url }) => url === "/")?.integrity).toBe(
    "sha384-a+8aI/v0PMJHOWYExjhZuTwR5gmQr8Nqr1f7V+yCC0fqGTTbHK1MeiyzboWMovCh",
  );
  expect(listed.find(({ url }) => url === "/w/bubble")?.integrity).toBe(
    "sha384-fJv/zJMaMwoZrSAIJ2yokByYBagNbAyVlneY8JEl/Zu1p1RtXc3a3kVSxr3Nl/sB",
  );
  expect(listed.filter(({ url }) => url.startsWith("/assets/"))).toEqual([
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

test("the worker is given nothing the build did not write: a name that is no file is never read", async () => {
  const read = vi.fn((name: string) => new TextEncoder().encode(name));
  await precached(["sw.js", "_headers", "icon-192.png"], read);
  expect(read).not.toHaveBeenCalled();
});

test("the list is the same whatever order the build gives its files in", () => {
  expect(precacheList([...BUILD].reverse())).toEqual(precacheList(BUILD));
});

// Each shell file's digest is its own file's: computed apart with openssl for the bytes `build /<file>`.
test("the shell's other files are read by their own names: the fallback, the manifest, the icon, a data file", async () => {
  const read = (name: string) => new TextEncoder().encode(`build /${name}`);
  expect(await precached(["__spa-fallback.html", "manifest.webmanifest", "icon.svg", "w/bubble.data"], read)).toEqual([
    {
      url: "/__spa-fallback.html",
      integrity: "sha384-UCyKpIWi0ow/XH1myT9UKy1NR3tFLs4REvJ/NT8Gunyx0Lh+nQpd3MNQAlpG3+pj",
    },
    { url: "/icon.svg", integrity: "sha384-mvU6O6nlkPvkrewzAtSonl135Ya5pgReH0Nj19egGuiAF0BZ9aUOBW7Hdtebkqvb" },
    {
      url: "/manifest.webmanifest",
      integrity: "sha384-Tjo0ktYz7Ajp6zLTF75kHPydhbAqttsRKhhQPoYmYNjsOBOow6ni69S7cbMySkZA",
    },
    { url: "/w/bubble.data", integrity: "sha384-mCkZgmr52liMvNQpptmGcG8FEnreTe4ZUw5Q9cDYnQEETjCGNdfSvaYlYJErxymB" },
  ]);
});
