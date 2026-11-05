// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import events from "../../data/events.json" with { type: "json" };
import news from "../../data/news.json" with { type: "json" };
import { fakeStream } from "../../tests/fakeStream.ts";
import { drawRoute, expectStreamClosedOnLeave } from "../../tests/routed.tsx";
import { type MetaArgs } from "react-router";
import { BACK_HOME, routeError, alertOf, expectClientAsBuild, render } from "../../tests/render.tsx";
import { failedPageMeta, homeMeta, missingUniverseMeta } from "../meta.ts";
import { site } from "../places.ts";
import Home, { clientLoader, ErrorBoundary, loader, meta } from "./home.tsx";

test("home links to each world by its name, at the world's path", async () => {
  const html = await render({ path: "/", Component: Home, loader }, "/");
  // F3267: the kicker says gno.world, and the one heading is the hero's line.
  expect(html).toMatch(/<p [^>]*>(?:<span [^>]*><\/span>)?gno\.world<\/p>/);
  expect(html).toMatch(/<h1\b[^>]*>2 worlds in Onyx<\/h1>/);
  expect(html).toContain('<a href="/w/bubble"');
  expect(html).toContain(">Bubble</a>");
  expect(html).toContain('<a href="/w/govdao"');
  expect(html).toContain(">GovDAO</a>");
});

const failing = {
  path: "/",
  Component: Home,
  loader: () => {
    throw new Error("the chain did not answer");
  },
  ErrorBoundary,
};

// The tags: the universe's own, a not-found's for an unknown universe, and a failure's for any other error.
test("home's tags are the universe's, not-found's or failure's", async () => {
  const universe = site.universe(new Request("https://gno.world/"), "cosmos");
  const args = (loaderData: typeof universe | undefined, error?: unknown) =>
    ({ loaderData, error }) as MetaArgs<typeof loader>;
  expect(meta(args(universe))).toEqual(homeMeta(universe));
  expect(
    meta(args(undefined, await routeError({ path: "/net/:network", Component: Home, loader }, "/net/nowhere"))),
  ).toEqual(missingUniverseMeta());
  expect(meta(args(undefined, new Error("the chain did not answer")))).toEqual(failedPageMeta());
});

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
    expect(/data-hero="number"[^>]*>\s*(?:<[^>]*>\s*)*([^<\s]+)/.exec(html)?.[1]).toBe("2");
    expect(html).toMatch(/\b2 worlds\b/);
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

// Slice 5m (frames 1 to 8): the live line under the actions, and the ticker from the data's news and events. The page the build
// writes holds states, never a price or a block height: those are read in the browser.
const escaped = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
const sample = (file: "news.json" | "events.json"): { title: string; link: string }[] =>
  file === "news.json" ? news : events;

describe("home's live line", () => {
  test("follows the actions inside the hero, as a loading state with no price and no height written into the page", async () => {
    const html = await render({ path: "/", Component: Home, loader }, "/");
    const after = html.split('data-hero="actions"')[1] ?? "";
    expect(after).toContain('data-hero="markets"');
    const line = after.split('data-hero="markets"')[1] ?? "";
    expect(line).toContain('data-markets="loading"');
    expect(html).not.toMatch(/data-token=|data-height=/);
    expect(html).not.toMatch(/\$\d/);
  });

  test("still claims nobody online, with the live line in", async () => {
    const html = await render({ path: "/", Component: Home, loader }, "/");
    expect(html).not.toMatch(/online|here now|talking/i);
  });
});

describe("home's ticker", () => {
  test("holds each placeholder news and event of the data as a link to its address", async () => {
    const html = await render({ path: "/", Component: Home, loader }, "/");
    expect(html).toContain("data-ticker");
    for (const { title, link } of [...sample("news.json"), ...sample("events.json")]) {
      expect(html, title).toContain(escaped(title));
      expect(html, link).toContain(`href="${link}"`);
    }
  });

  test("is drawn under /net/gnoland too: the lists are the site's, not a universe's", async () => {
    const html = await render({ path: "/net/:network", Component: Home, loader }, "/net/gnoland");
    expect(html).toContain("data-ticker");
  });

  test("is written the same whatever the time of the build: no event is dropped from the markup by the clock", async () => {
    const written = async (time: string) => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(time));
      return render({ path: "/", Component: Home, loader }, "/");
    };
    const before = await written("2026-10-31T12:00:00Z");
    const after = await written("2100-01-01T00:00:00Z");
    expect(after).toBe(before);
    for (const { title } of sample("events.json")) expect(after, title).toContain(escaped(title));
  });
});

afterEach(() => {
  vi.useRealTimers();
});

// Slice 9g (F5784, frame 6): the page follows the Earth's room once it has run, and the strip draws the deploys the stream tells.
describe("home and the chain's stream", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
  const deploy = (universe: string, name: string, height: number) => ({
    id: `h${String(height)}:0`,
    kind: "deploy",
    universe,
    realm: `gno.land/r/${ALICE}/${name}`,
    actor: ALICE,
    height,
  });

  test("follows #earth, draws a deploy of its universe in the strip as a signal, and none of another's", async () => {
    const sources = fakeStream();
    const { box } = drawRoute({ path: "/", Component: Home, loader }, "/");
    await vi.waitFor(() => {
      expect(sources.opened.map(({ url }) => url)).toEqual(["/api/stream?rooms=%23earth"]);
    });
    sources.opened[0]?.emit("chain", deploy("gnoland", "theirs", 11));
    sources.opened[0]?.emit("chain", deploy("onyx", "mine", 10));
    await vi.waitFor(() => {
      expect(box.textContent).toContain("r/g10gh7…y5tv/mine deployed · block 10");
    });
    expect(box.textContent).not.toContain("theirs");
    expect(box.textContent).toContain("Signal");
  });

  test("links a deploy under its universe's own path: none for the default one, /net/<id> for another", async () => {
    const sources = fakeStream();
    const onyx = drawRoute({ path: "/", Component: Home, loader }, "/");
    await vi.waitFor(() => {
      expect(sources.opened).toHaveLength(1);
    });
    sources.opened[0]?.emit("chain", deploy("onyx", "mine", 10));
    await vi.waitFor(() => {
      expect(onyx.box.querySelector("[data-ticker] a")?.getAttribute("href")).toBe(`/r/${ALICE}/mine`);
    });
    onyx.leave();
    const gnoland = drawRoute({ path: "/net/:network", Component: Home, loader }, "/net/gnoland");
    await vi.waitFor(() => {
      expect(sources.opened).toHaveLength(2);
    });
    sources.opened[1]?.emit("chain", deploy("gnoland", "theirs", 11));
    await vi.waitFor(() => {
      expect(gnoland.box.querySelector("[data-ticker] a")?.getAttribute("href")).toBe(`/net/gnoland/r/${ALICE}/theirs`);
    });
  });

  test("closes the stream when the page is left", async () => {
    await expectStreamClosedOnLeave({ path: "/", Component: Home, loader }, "/");
  });
});
