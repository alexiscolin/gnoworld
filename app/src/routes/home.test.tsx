// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { type MetaArgs } from "react-router";
import { BACK_HOME, routeError, alertOf, expectClientAsBuild, headingOf, render } from "../../tests/render.tsx";
import { failedPageMeta, homeMeta, missingUniverseMeta } from "../meta.ts";
import { site } from "../places.ts";
import Home, { clientLoader, ErrorBoundary, loader, meta } from "./home.tsx";

const { useSpace, useWorldsCount, useResting, useNewcomer } = vi.hoisted(() => ({
  useSpace: vi.fn(),
  useWorldsCount: vi.fn<(wanted: boolean) => number | null | undefined>(() => undefined),
  useResting: vi.fn<() => string | undefined>(() => undefined),
  useNewcomer: vi.fn<() => boolean>(() => false),
}));
vi.mock("../features/universe/index.ts", () => ({
  useSpace,
  useWorldsCount,
  useResting,
  useNewcomer,
  useCosmosAddress: () => undefined,
  // The resting system's worlds (the home's hero names them): none, as no system is laid out in a page the test renders.
  useRestingWorlds: () => undefined,
}));
afterEach(() => {
  useResting.mockReturnValue(undefined);
});
// The rail is a lazy chunk the server render never waits for: its stand-in keeps the places the page hands it.
const { railProps } = vi.hoisted(() => ({ railProps: [] as { places?: unknown }[] }));
vi.mock("../features/universe/railLazy.ts", () => ({
  LazyRail: (props: { places?: unknown }) => {
    railProps.push(props);
    return null;
  },
}));
test("home links to each world by its name, at the world's path", async () => {
  const html = await render({ path: "/", Component: Home, loader }, "/");
  // F3267, 8i: the kicker says gno.land · live now as frame 6, and the one heading is the hero's line, its figure's room kept while the number comes (7n).
  expect(html).toMatch(/<p [^>]*>(?:<span [^>]*><\/span>)?gno\.land · live now<\/p>/);
  expect(headingOf(html)).toBe("Worlds in Onyx");
  expect(html).toContain('<a href="/w/bubble"');
  expect(html).toContain(">Bubble</a>");
  expect(html).toContain('<a href="/w/govdao"');
  expect(html).toContain(">GovDAO</a>");
});

// 7d6: the hero counts what the cosmos draws, from the worlds' file, never the page's list (hubs.json said 2 over 533).
test("counts in its hero the worlds the cosmos draws, once their file has come, and no number before", async () => {
  useWorldsCount.mockReturnValue(534);
  const html = await render({ path: "/", Component: Home, loader }, "/");
  expect(headingOf(html)).toBe("534 worlds in Onyx");
  expect(html).toMatch(/data-hero="number"[^>]*>534</);
  useWorldsCount.mockReturnValue(undefined);
  expect(await render({ path: "/", Component: Home, loader }, "/")).not.toMatch(/data-hero="number"[^>]*>\d/);
});

// 7n: the line keeps the figure's room while the number comes, so the actions beside it do not slide; a read that brought none falls back.
test("keeps the line's figure while its number comes, and names the worlds without one once none came", async () => {
  useWorldsCount.mockReturnValue(undefined);
  const coming = await render({ path: "/", Component: Home, loader }, "/");
  expect(coming).toMatch(/data-hero="figure"[^>]*><\/span>/);
  expect(headingOf(coming)).toBe("Worlds in Onyx");
  useWorldsCount.mockReturnValue(null);
  const none = await render({ path: "/", Component: Home, loader }, "/");
  expect(none).not.toContain('data-hero="figure"');
  expect(headingOf(none)).toBe("Worlds in Onyx");
  expect(none).not.toMatch(/data-hero="number"[^>]*>\d/);
  useWorldsCount.mockReturnValue(undefined);
});

test("counts another universe's worlds by its page's list: no cosmos is drawn there", async () => {
  useWorldsCount.mockReturnValue(534);
  const html = await render({ path: "/net/:universe", Component: Home, loader }, "/net/gnoland/");
  expect(html).not.toContain("534");
  useWorldsCount.mockReturnValue(undefined);
});

// 7n: the number came only from the scene, so a home whose scene never runs (no WebGL, a refused GPU, a phone) lost it for good; 7n2: it reads
// the worlds' count, not their file, so a phone asks nothing of the cosmos before View in space.
test("asks the worlds' count for its hero's number on the default universe's home alone, whether the scene runs or not", async () => {
  useWorldsCount.mockClear();
  await render({ path: "/", Component: Home, loader }, "/");
  expect(useWorldsCount).toHaveBeenLastCalledWith(true);
  await render({ path: "/net/:universe", Component: Home, loader }, "/net/gnoland/");
  expect(useWorldsCount).toHaveBeenLastCalledWith(false);
});

test("asks for the worlds on the default universe's home alone: universes are never shown together", async () => {
  useSpace.mockClear();
  await render({ path: "/", Component: Home, loader }, "/");
  expect(useSpace.mock.lastCall?.[0]).toBe("cosmos");
  useSpace.mockClear();
  await render({ path: "/net/:universe", Component: Home, loader }, "/net/gnoland/");
  expect(useSpace).toHaveBeenLastCalledWith(undefined);
});

// 7i: the rail beside the cosmos links each world to its page, the Earth's and the hubs' as the page lists them, through the page's router.
// The rail is its own lazy chunk now and takes the places as its props (the cosmos is handed none: D431's hero and rail).
test("hands the rail the places it links to", async () => {
  railProps.length = 0;
  await render({ path: "/", Component: Home, loader }, "/");
  expect(railProps.at(-1)?.places).toEqual({
    earth: "/earth",
    worlds: [
      expect.objectContaining({ slug: "bubble", path: "/w/bubble" }),
      expect.objectContaining({ slug: "govdao", path: "/w/govdao", realms: ["gno.land/r/gov/dao"] }),
      // The stations round the Earth are no place while STATIONS_SHOWN is off (places.ts, ping-pong of 2026-11-07..09): their pages stay routable.
    ],
  });
});

// 7i: where the rail stands it stands for the page's list of worlds, which steps aside (Hero.module.css).
test("marks its list of worlds as the one a rail stands for", async () => {
  const html = await render({ path: "/", Component: Home, loader }, "/");
  expect(html).toMatch(/<nav aria-label="Worlds"[^>]*data-rail="none"/);
});

// ADR-0003 §2, 2d: a kicker names the page's list of worlds, inside it, so it steps aside with it where the rail stands (7i).
test("names its list of worlds with a Worlds kicker, inside the list's own box and before its links", async () => {
  const html = await render({ path: "/", Component: Home, loader }, "/");
  const list = /<nav aria-label="Worlds"[^>]*>(.*?)<\/nav>/s.exec(html)?.[1] ?? "";
  expect(list).toMatch(/^<p class="label [^"]*">Worlds<\/p><ul/);
  expect(list).toContain('href="/w/bubble"');
});

// ADR-0003 §3: one filled call at a time, as the device says the reader is new (F4501); on the default universe's home alone, where the
// cosmos's labels say "Start here" (F4508).
describe("home's actions for a newcomer", () => {
  const actionsOf = (html: string) => /<div [^>]*data-hero="actions"[^>]*>/.exec(html)?.[0] ?? "";
  afterEach(() => {
    useNewcomer.mockReturnValue(false);
  });

  test("marks the hero's actions as a first visit's while the device says the reader is new", async () => {
    useNewcomer.mockReturnValue(true);
    expect(actionsOf(await render({ path: "/", Component: Home, loader }, "/"))).toContain("data-first");
    useNewcomer.mockReturnValue(false);
    expect(actionsOf(await render({ path: "/", Component: Home, loader }, "/"))).not.toContain("data-first");
  });

  test("leaves another universe's actions unmarked, for no label of its says Start here", async () => {
    useNewcomer.mockReturnValue(true);
    expect(actionsOf(await render({ path: "/net/:network", Component: Home, loader }, "/net/gnoland"))).not.toContain(
      "data-first",
    );
  });
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

// The hero's big number, its line and two actions, and with no data what is true. At a system's view the screen is the system's: the hero
// stays and names it with no actions, the list of worlds and the crumb give way, and both come back at rest.
test("gives the screen to a system the eye rests at: its hero with no actions and no list of worlds, both back at rest", async () => {
  useResting.mockReturnValue("gnoswap");
  const there = await render({ path: "/", Component: Home, loader }, "/");
  expect(there).toContain("gno.land · system");
  expect(there).not.toContain('data-hero="actions"');
  expect(there).not.toContain('<a href="/w/bubble"');
  useResting.mockReturnValue(undefined);
  const home = await render({ path: "/", Component: Home, loader }, "/");
  expect(home).toContain('data-hero="actions"');
  expect(home).toContain('<a href="/w/bubble"');
});

describe("home's hero", () => {
  test("claims nobody online while no source says so: no number of people, no sample (5m fills it)", async () => {
    const html = await render({ path: "/", Component: Home, loader }, "/");
    expect(html).not.toMatch(/online|here now|talking/i);
    expect(html).not.toMatch(/\b71\b/);
  });

  test("a universe with no world shows 0, in the plural, and nothing it does not hold", async () => {
    const html = await render({ path: "/net/:network", Component: Home, loader }, "/net/gnoland");
    expect(/data-hero="number"[^>]*>\s*(?:<[^>]*>\s*)*([^<\s]+)/.exec(html)?.[1]).toBe("0");
    expect(headingOf(html)).toMatch(/^0 worlds in /);
    expect(html).not.toMatch(/NaN|undefined|\b1 world\b/);
  });

  // ADR-0003 §3: Go explore, whose address is the Earth's and whose click flies to the busiest world, then Join the chat, the Earth's room.
  test("offers two big actions, Go explore and Join the chat, both addressed to the universe's Earth, in that order", async () => {
    const html = await render({ path: "/", Component: Home, loader }, "/");
    // The actions' own container: what follows its mark: its first two links.
    // Join the chat opens the Earth's room grown to the full screen (fullChatHref, "?chat=full"), as the header's Chat does.
    const hero = html.split('data-hero="actions"')[1] ?? "";
    expect(
      [...hero.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([^<]+)/g)].map((match) => [match[1], match[2]]).slice(0, 2),
    ).toEqual([
      ["/earth", "Go explore"],
      ["/earth?chat=full", "Join the chat"],
    ]);
  });

  test("keeps the actions inside the universe: under /net/gnoland the Earth is gno.land's", async () => {
    const html = await render({ path: "/net/:network", Component: Home, loader }, "/net/gnoland");
    const hero = html.split('data-hero="actions"')[1] ?? "";
    expect([...hero.matchAll(/<a [^>]*href="([^"]+)"/g)].map((match) => match[1]).slice(0, 2)).toEqual([
      "/net/gnoland/earth",
      "/net/gnoland/earth?chat=full",
    ]);
  });
});

// Slice 5m (frames 1 to 8): the hero's line. The ticker, the markets row and the on-air lines are gone (D431, D425), with the home's stream.
describe("home's live line", () => {
  test("still claims nobody online, with the live line in", async () => {
    const html = await render({ path: "/", Component: Home, loader }, "/");
    expect(html).not.toMatch(/online|here now|talking/i);
  });
});
