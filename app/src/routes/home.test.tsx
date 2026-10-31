import { describe, expect, test } from "vitest";
import { BACK_HOME, alertOf, expectClientAsBuild, render } from "../../tests/render.tsx";
import Home, { clientLoader, ErrorBoundary, loader } from "./home.tsx";

test("home links to each world by its name, at the world's path", async () => {
  const html = await render({ path: "/", Component: Home, loader }, "/");
  // F3267: the kicker says gno.world, and the one heading is the hero's line.
  expect(html).toMatch(/<p [^>]*>(?:<span [^>]*><\/span>)?gno\.world<\/p>/);
  expect(html).toMatch(/<h1\b[^>]*>1 world in Onyx<\/h1>/);
  expect(html).toContain('<a href="/w/bubble"');
  expect(html).toContain(">Bubble</a>");
});

const failing = {
  path: "/",
  Component: Home,
  loader: () => {
    throw new Error("the chain did not answer");
  },
  ErrorBoundary,
};

// Every route catches its own errors (docs/ARCHITECTURE.md; F329).
test("home shows its own alert when it fails, with a way home", async () => {
  const html = await render(failing, "/");
  expect(html).toContain('role="alert"');
  expect(alertOf(html)).toMatch(BACK_HOME);
});

// The app may be what failed: the way home loads the document again (F325).
test("home's way out of a failure loads the document again", async () => {
  const alert = alertOf(await render(failing, "/", { slot: true }));
  expect(alert).toMatch(BACK_HOME);
  expect(alert).not.toContain("data-routed");
});

// The browser serves the pages the build wrote, from the same data (F2208).
test("the browser's loader gives each pre-rendered home what the build's does", () => {
  expectClientAsBuild("cosmos", clientLoader, loader);
});

// Slice 5r (frames 1 to 8): the hero's big number, its line and two big actions; with no data, what is true.
describe("home's hero", () => {
  test("shows the number of worlds the data holds as its big number, its line saying what it counts", async () => {
    const html = await render({ path: "/", Component: Home, loader }, "/");
    expect(/data-hero="number"[^>]*>\s*(?:<[^>]*>\s*)*([^<\s]+)/.exec(html)?.[1]).toBe("1");
    expect(html).toMatch(/\b1 world\b/);
  });

  test("claims nobody online while no source says so: no number of people, no sample (5m fills it)", async () => {
    const html = await render({ path: "/", Component: Home, loader }, "/");
    expect(html).not.toMatch(/online|here now|talking/i);
    expect(html).not.toMatch(/\b71\b/);
  });

  test("a universe with no world shows 0, in the plural, and nothing it does not hold", async () => {
    const html = await render({ path: "/net/:network", Component: Home, loader }, "/net/gnoland");
    expect(/data-hero="number"[^>]*>\s*(?:<[^>]*>\s*)*([^<\s]+)/.exec(html)?.[1]).toBe("0");
    expect(html).toMatch(/\b0 worlds\b/);
    expect(html).not.toMatch(/NaN|undefined|\b1 world\b/);
  });

  test("offers two big actions, the universe's Earth and the places' list, in that order", async () => {
    const html = await render({ path: "/", Component: Home, loader }, "/");
    // The actions' own container: what follows its mark: its first two links.
    const hero = (html.split('data-hero="actions"')[1] ?? "").split("data-hero=")[0] ?? "";
    expect([...hero.matchAll(/<a [^>]*href="([^"]+)"/g)].map((match) => match[1]).slice(0, 2)).toEqual([
      "/earth",
      "/list",
    ]);
  });

  test("keeps the actions inside the universe: under /net/gnoland the Earth is gno.land's", async () => {
    const html = await render({ path: "/net/:network", Component: Home, loader }, "/net/gnoland");
    const hero = (html.split('data-hero="actions"')[1] ?? "").split("data-hero=")[0] ?? "";
    expect([...hero.matchAll(/<a [^>]*href="([^"]+)"/g)].map((match) => match[1]).slice(0, 2)).toEqual([
      "/net/gnoland/earth",
      "/list",
    ]);
  });
});
