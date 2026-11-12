import { Outlet, type RouteObject } from "react-router";
import { describe, expect, test } from "vitest";
import { render } from "../tests/render.tsx";
import Earth, { loader as earthLoader } from "./routes/earth.tsx";
import { clientLoader as cosmosLoader } from "./routes/cosmos.tsx";
import Home, { ErrorBoundary as HomeError, loader as homeLoader } from "./routes/home.tsx";
import World, { ErrorBoundary as WorldError, loader as worldLoader } from "./routes/world.tsx";
import { site, siteOf } from "./places.ts";
import { PLANTED } from "./placesFixture.ts";
import { Shell } from "./shell.tsx";
import { ShellHeader } from "./shellHeader.tsx";
import { levelsOf } from "./shellWays.tsx";

// Slice 5r (O1, O4): the header as the video's frames 1, 20 and 37 show it: the logo, the views Universe, System and Earth, the
// network named, "Testnet" on a testnet, search. Slice 8: the middle view says "Universe" (Alexis), Jarvis is coming soon, the chat and
// the passport's counter are controls.
const inShell = (Page: () => React.JSX.Element) => () => (
  <Shell>
    <Page />
  </Shell>
);
const routes: Record<string, RouteObject> = {
  "/": { path: "/", Component: inShell(Home), loader: homeLoader },
  "/universe": { path: "/universe", Component: inShell(Home), loader: cosmosLoader },
  "/net/gnoland": { path: "/net/:network", Component: inShell(Home), loader: homeLoader },
  "/net/onyx": { path: "/net/:network", Component: inShell(Home), loader: homeLoader },
  "/net/onyx/earth": { path: "/net/:network/earth", Component: inShell(Earth), loader: earthLoader },
  "/earth": { path: "/earth", Component: inShell(Earth), loader: earthLoader },
  "/w/bubble": { path: "/w/:world", Component: inShell(World), loader: worldLoader },
};
// The pages whose loader found nothing: Layout wraps them as it wraps every document, so the Shell sits outside the route.
const failed = (path: string, child: RouteObject): RouteObject => ({
  path: "*",
  Component: () => (
    <Shell>
      <Outlet />
    </Shell>
  ),
  children: [{ ...child, path }],
});
const missing: Record<string, RouteObject> = {
  "/net/nope": failed("net/:network", { Component: Home, loader: homeLoader, ErrorBoundary: HomeError }),
  "/w/nope": failed("w/:world", { Component: World, loader: worldLoader, ErrorBoundary: WorldError }),
};
const header = async (path: string) => {
  const route = routes[path] ?? missing[path];
  if (route === undefined) throw new RangeError(`no route for ${path}`);
  const html = await render(route, path);
  const found = /<header\b[\s\S]*?<\/header>/.exec(html)?.[0];
  expect(found, `no <header> on ${path}`).toBeDefined();
  return found ?? "";
};

describe("the header", () => {
  test.each(["/", "/earth", "/w/bubble"])("%s: holds the logo, as the link home, named gnoworld", async (path) => {
    const html = await header(path);
    // The word is "gno" in the semibold and "world" in the light weight: the link's text, tags off, is gnoworld.
    const link = /<a [^>]*href="\/"[^>]*>((?:(?!<\/a>)[\s\S])*)<\/a>/.exec(html)?.[1] ?? "";
    expect(link.replace(/<[^>]*>/g, "")).toBe("gnoworld");
  });

  // D424, D444: the views' pill is Galaxy, then the System and the World, each named by the place it leads to (the page's own, else the
  // Earth's home), then the full chat of that world; no List (D344). D501, D561: the Earth's system is /s/gnoland, never the home's first screen.
  const text = (html: string) => html.replace(/<[^>]*>/g, "");
  const pillLinks = (html: string) => {
    const pill = /<nav [^>]*aria-label="Views"[^>]*>([\s\S]*?)<\/nav>/.exec(html)?.[1] ?? "";
    return [...pill.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map(
      ([, href, label]) => [href, text(label ?? "")] as const,
    );
  };
  test.each([
    ["/", "/earth", "Earth"],
    ["/earth", "/earth", "Earth"],
    ["/w/bubble", "/w/bubble", "Bubble"],
  ])(
    "%s: offers Galaxy, System and World, in that order, as links to their pages, then the world's chat, and no List",
    async (path, world, name) => {
      const links = pillLinks(await header(path));
      expect(links).toEqual([
        ["/universe", "Galaxy"],
        ["/s/gnoland", "Systemgno.land"],
        [world, `World${name}`],
        [`${world}?chat=full`, "Chat"],
      ]);
    },
  );

  // 7v (Alexis, 2026-11-03, the GUI board's option B): two icons after the pill's views say how one looks at space, once the page wakes
  // (F4692): the page as written holds none, so a not-found path, served the fallback written at /, hydrates as its own page.
  test.each(["/", "/net/gnoland"])(
    "%s: offers no views of space in the page as written, before it wakes",
    async (path) => {
      const html = await header(path);
      expect(html).not.toMatch(/Views of space|Dynamic view|Plan view/);
    },
  );

  test.each(["/earth", "/w/bubble"])("%s: offers no views of space to switch", async (path) => {
    const html = await header(path);
    expect(html).not.toMatch(/Views of space|Dynamic view|Plan view/);
  });
  // ADR-0003 §2, 2c: each view says what it holds to a screen reader alone, as its description; nothing is drawn under the tabs.
  test.each(["/", "/earth", "/net/gnoland"])(
    "%s: describes each view to screen readers, and draws no word of it",
    async (path) => {
      const html = await header(path);
      const described = [...html.matchAll(/<a [^>]*aria-description="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map(
        ([, description, label]) => [text(label ?? ""), description] as const,
      );
      expect(described).toEqual([
        ["Galaxy", "every system, as a star"],
        ["Systemgno.land", "the worlds of gno.land round its sun"],
        ["WorldEarth", "Earth: its page and its chat"],
      ]);
      expect(html.replace(/aria-description="[^"]*"/g, "")).not.toMatch(
        /every system|round its sun|its page and its chat/,
      );
    },
  );

  test("keeps the views inside a universe's own pages: Cosmos and Earth of gno.land under /net/gnoland", async () => {
    const html = await header("/net/gnoland");
    expect(html).toContain('href="/net/gnoland/earth"');
    expect(html).toContain('href="/net/gnoland/"');
  });

  const current = (html: string) =>
    [...html.matchAll(/<a [^>]*aria-current="page"[^>]*>([\s\S]*?)<\/a>/g)].map(([, label]) => text(label ?? ""));

  test("says which level it is on, once, and on no other", async () => {
    expect(current(await header("/earth"))).toEqual(["WorldEarth"]);
    expect(current(await header("/w/bubble"))).toEqual(["WorldBubble"]);
    expect(current(await header("/universe"))).toEqual(["Galaxy"]);
    expect(current(await header("/net/gnoland"))).toEqual(["Systemgno.land"]);
  });

  // D501: the default universe's home is the Earth's first screen, no level of the header in view.
  test("marks no level on the home's first screen", async () => {
    expect(current(await header("/"))).toEqual([]);
    expect(await header("/")).not.toContain("aria-current");
  });

  // F3270: the addresses `canonical` and `og:url` publish are /net/onyx/ and /net/onyx/earth, and a person can arrive on them.
  test("/net/onyx/earth, a canonical address, marks the World level, named Earth, as the current one", async () => {
    expect(current(await header("/net/onyx/earth"))).toEqual(["WorldEarth"]);
  });

  test("/net/onyx, the default universe's canonical home, is the home's first screen: no level is current", async () => {
    expect(current(await header("/net/onyx"))).toEqual([]);
  });

  test("names the network, and says Testnet on the default universe, Onyx, which is one (O4)", async () => {
    const html = await header("/");
    expect(html).toContain("Onyx");
    expect(html).toContain("Testnet");
  });

  // F3268: "Testnet" is a use of the static chip, in the caution tone with the warning icon (DESIGN-SYSTEM.md, "Severity").
  test("says Testnet in the static chip, warm, with the warning icon beside it", async () => {
    const html = await header("/");
    expect(html).toMatch(/<span [^>]*data-tone="warm"[^>]*data-size="xs"[^>]*>Testnet<\/span>/);
    expect(html).toMatch(/data-icon="warning"/);
  });

  test("says Testnet on a world of a testnet too, and not on a universe that is no testnet", async () => {
    expect(await header("/w/bubble")).toContain("Testnet");
    const mainnet = await header("/net/gnoland");
    expect(mainnet).toContain("gno.land");
    expect(mainnet).not.toContain("Testnet");
  });

  // F3265: the video's search is the last of the views' pill, after a divider.
  test("keeps search inside the views' pill, after the levels and the chat, and the wide one in the account's row", async () => {
    const html = await header("/earth");
    const pill = /<nav [^>]*aria-label="Views"[^>]*>([\s\S]*?)<\/nav>/.exec(html)?.[1] ?? "";
    expect(pill.indexOf("Earth")).toBeGreaterThan(0);
    expect(pill.indexOf(">Chat<")).toBeGreaterThan(pill.indexOf("Earth"));
    expect(pill.match(/aria-label="Search"/g)).toHaveLength(1);
    expect(pill.indexOf('aria-label="Search"')).toBeGreaterThan(pill.indexOf(">Chat<"));
    expect(html.match(/aria-label="Search"/g)).toHaveLength(2);
  });

  // D444 (after D366): the chat full of the world in view, or of the Earth, is a control beside the World level, named for its world; no
  // Jarvis till its slice lands, and the passport the account menu's alone (D329, D342).
  test("shows the full chat as a control named for its world, and neither Jarvis nor a passport counter", async () => {
    const html = await header("/");
    expect(html).toMatch(
      /<a [^>]*aria-label="Chat of Earth"[^>]*href="\/earth\?chat=full"[^>]*>(?:(?!<\/a>)[\s\S])*Chat</,
    );
    expect(await header("/w/bubble")).toContain('aria-label="Chat of Bubble"');
    expect(html).not.toContain("Jarvis");
    expect(html).not.toContain(">Passport </span>");
  });

  // Layout wraps every document, the failed ones too: no loader data is there, and the header still tells the truth.
  // The World level is the page's own, a path that holds a chat even when its world is not found (shellWays.tsx's worldAt).
  test.each([
    ["/net/nope", "/earth"],
    ["/w/nope", "/w/nope"],
  ])("%s: a page that found nothing keeps the header, naming the default network", async (path, world) => {
    const html = await header(path);
    expect(html).toContain("Onyx");
    expect(html).toContain("Testnet");
    expect(html).not.toMatch(/undefined|NaN|\[object/);
    expect(html).toContain(`href="${world}"`);
  });
});

// A path that names no world (`/w/`) still names its World level: its link has text for a reader that cannot see it.
test("/w/: the World level has a name", () => {
  const world = levelsOf(site.universeAt("/w/"), "/w/").levels.find((level) => level.view === "world");
  expect(world?.name).not.toBe("");
});

// O4: "Testnet" says what the data says of a universe, not what a name or a default says. The real data has one testnet and it is
// the default one (Onyx), so this site is planted: its default is no testnet, and its second universe, not the default, is one.
describe("the header's Testnet, on a planted site", () => {
  const planted = siteOf(PLANTED);
  const headerOf = async (id: string) => {
    const universe = planted.universes.find((each) => each.id === id);
    if (universe === undefined) throw new RangeError(id);
    return render({ path: "/", Component: () => <ShellHeader universe={universe} /> }, "/");
  };

  test("is shown on a testnet that is not the default universe", async () => {
    const html = await headerOf("lab");
    expect(html).toContain("Lab");
    expect(html).toContain("Testnet");
  });

  test("is not shown on a default universe that is no testnet", async () => {
    const html = await headerOf("main");
    expect(html).toContain("Mainland");
    expect(html).not.toContain("Testnet");
  });
});
