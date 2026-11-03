import { Outlet, type RouteObject } from "react-router";
import { describe, expect, test } from "vitest";
import { render } from "../tests/render.tsx";
import Earth, { loader as earthLoader } from "./routes/earth.tsx";
import Home, { ErrorBoundary as HomeError, loader as homeLoader } from "./routes/home.tsx";
import List from "./routes/list.tsx";
import World, { ErrorBoundary as WorldError, loader as worldLoader } from "./routes/world.tsx";
import { siteOf } from "./places.ts";
import { PLANTED } from "./placesFixture.ts";
import { Shell } from "./shell.tsx";
import { ShellHeader } from "./shellHeader.tsx";

// Slice 5r (O1, O4): the header as the video's frames 1, 20 and 37 show it: the logo, the views Earth, Cosmos and List, the
// network named, "Testnet" on a testnet, search. A control appears only when it works: no Jarvis, chat, bell or passport yet.
const inShell = (Page: () => React.JSX.Element) => () => (
  <Shell>
    <Page />
  </Shell>
);
const routes: Record<string, RouteObject> = {
  "/": { path: "/", Component: inShell(Home), loader: homeLoader },
  "/net/gnoland": { path: "/net/:network", Component: inShell(Home), loader: homeLoader },
  "/net/onyx": { path: "/net/:network", Component: inShell(Home), loader: homeLoader },
  "/net/onyx/earth": { path: "/net/:network/earth", Component: inShell(Earth), loader: earthLoader },
  "/earth": { path: "/earth", Component: inShell(Earth), loader: earthLoader },
  "/w/bubble": { path: "/w/:world", Component: inShell(World), loader: worldLoader },
  "/list": { path: "/list", Component: inShell(List) },
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
  test.each(["/", "/earth", "/list", "/w/bubble"])(
    "%s: holds the logo, as the link home, named gnoworld",
    async (path) => {
      const html = await header(path);
      // The word is "gno" in the semibold and "world" in the light weight: the link's text, tags off, is gnoworld.
      const link = /<a [^>]*href="\/"[^>]*>((?:(?!<\/a>)[\s\S])*)<\/a>/.exec(html)?.[1] ?? "";
      expect(link.replace(/<[^>]*>/g, "")).toBe("gnoworld");
    },
  );

  test.each(["/", "/earth", "/list", "/w/bubble"])(
    "%s: offers the views Earth, Cosmos and List, in that order, as links to their pages",
    async (path) => {
      const html = await header(path);
      const links = [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map(
        ([, href, label]) => [href, (label ?? "").replace(/<[^>]*>/g, "")] as const,
      );
      const views = links.filter(([, label]) => ["Earth", "Cosmos", "List"].includes(label));
      expect(views).toEqual([
        ["/earth", "Earth"],
        ["/", "Cosmos"],
        ["/list", "List"],
      ]);
    },
  );

  // ADR-0003 §2, 2c: each view says what it holds to a screen reader alone, as its description; nothing is drawn under the tabs.
  test.each(["/", "/earth", "/net/gnoland"])(
    "%s: describes each view to screen readers, and draws no word of it",
    async (path) => {
      const html = await header(path);
      const described = [...html.matchAll(/<a [^>]*aria-description="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map(
        ([, description, label]) => [(label ?? "").replace(/<[^>]*>/g, ""), description] as const,
      );
      expect(described).toEqual([
        ["Earth", "where everyone talks"],
        ["Cosmos", "every world"],
        ["List", "every world, as text"],
      ]);
      expect(html.replace(/aria-description="[^"]*"/g, "")).not.toMatch(/where everyone talks|every world/);
    },
  );

  test("keeps the views inside a universe's own pages: Cosmos and Earth of gno.land under /net/gnoland", async () => {
    const html = await header("/net/gnoland");
    expect(html).toContain('href="/net/gnoland/earth"');
    expect(html).toContain('href="/net/gnoland/"');
  });

  test("says which view it is on, once, and on no other", async () => {
    const earth = await header("/earth");
    expect(earth.match(/aria-current="page"/g)).toHaveLength(1);
    expect(/<a [^>]*aria-current="page"[^>]*>(?:(?!<\/a>)[\s\S])*Earth/.test(earth)).toBe(true);
    const cosmos = await header("/");
    expect(/<a [^>]*aria-current="page"[^>]*>(?:(?!<\/a>)[\s\S])*Cosmos/.test(cosmos)).toBe(true);
  });

  // F3270: the addresses `canonical` and `og:url` publish are /net/onyx/ and /net/onyx/earth, and a person can arrive on them.
  test.each([
    ["/net/onyx/earth", "Earth"],
    ["/net/onyx", "Cosmos"],
  ])("%s, a canonical address, marks %s as the current view", async (path, view) => {
    const html = await header(path);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(new RegExp(`<a [^>]*aria-current="page"[^>]*>(?:(?!</a>)[\\s\\S])*${view}`).test(html)).toBe(true);
  });

  test("marks no view on a page that is none of them", async () => {
    expect(await header("/w/bubble")).not.toContain("aria-current");
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
  test("keeps search inside the views' pill, after the three views", async () => {
    const html = await header("/earth");
    const pill = /<nav [^>]*aria-label="Views"[^>]*>([\s\S]*?)<\/nav>/.exec(html)?.[1] ?? "";
    expect(pill.indexOf("List")).toBeGreaterThan(0);
    expect(pill.indexOf('aria-label="Search"')).toBeGreaterThan(pill.indexOf("List"));
    expect(html.match(/aria-label="Search"/g)).toHaveLength(1);
  });

  // No dead control: the video's Jarvis, chat, bell and passport work only once their slices land.
  test("shows no control that does nothing yet: no Jarvis, Chat, notifications or passport", async () => {
    const html = await header("/earth");
    for (const dead of [/Jarvis/, /\bChat\b/, /Notification/i, /Passport/i, /Unread/i]) expect(html).not.toMatch(dead);
  });

  // Layout wraps every document, the failed ones too: no loader data is there, and the header still tells the truth.
  test.each(["/net/nope", "/w/nope"])(
    "%s: a page that found nothing keeps the header, naming the default network",
    async (path) => {
      const html = await header(path);
      expect(html).toContain("Onyx");
      expect(html).toContain("Testnet");
      expect(html).not.toMatch(/undefined|NaN|\[object/);
      expect(html).toContain('href="/earth"');
    },
  );
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
