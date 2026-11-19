// @vitest-environment jsdom
import { act } from "react";
import { MemoryRouter, Outlet, type RouteObject } from "react-router";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { mount, noObservers, popovers, settled } from "../tests/mount.tsx";
import { render } from "../tests/render.tsx";
import { USE_A_COMPUTER } from "./features/login/index.ts";
import { StoreProvider } from "./storeContext.tsx";
import Earth, { loader as earthLoader } from "./routes/earth.tsx";
import { clientLoader as cosmosLoader } from "./routes/cosmos.tsx";
import Home, { ErrorBoundary as HomeError, loader as homeLoader } from "./routes/home.tsx";
import World, { ErrorBoundary as WorldError, loader as worldLoader } from "./routes/world.tsx";
import { site, siteOf } from "./places.ts";
import { PLANTED } from "./placesFixture.ts";
import { Shell } from "./shell.tsx";
import { ShellHeader } from "./shellHeader.tsx";
import { levelsOf } from "./headerPills.tsx";

// The header as the video's frames 1, 20 and 37 show it: the logo, the views, the network named, "Testnet" on a testnet, search;
// the chat is a control, and the passport's counter is not one.
const inShell = (Page: () => React.JSX.Element | null) => () => (
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

  // The views' pill is Galaxy, then the System and the World, each named by the place it leads to (the page's own, else the
  // Earth's home), then the full chat of that world; no List. The Earth's system is /s/gnoland, never the home's first screen.
  const text = (html: string) => html.replace(/<[^>]*>/g, "");
  const pillLinks = (html: string) => {
    const pill = /<nav [^>]*aria-label="Views"[^>]*>([\s\S]*?)<\/nav>/.exec(html)?.[1] ?? "";
    return [...pill.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map(
      ([, href, label]) => [href, text(label ?? "")] as const,
    );
  };
  // Every icon is the design system's (D14003): the chevrons between the levels are its icon, no character a page's encoding could garble.
  test("draws the chevrons between the levels as the design system's icon, never a character", async () => {
    const pill = /<nav [^>]*aria-label="Views"[^>]*>([\s\S]*?)<\/nav>/.exec(await header("/w/bubble"))?.[1] ?? "";
    const between = pill.split(/<a [^>]*>[\s\S]*?<\/a>/).slice(1, 3);
    expect(between).toHaveLength(2);
    for (const gap of between) {
      expect(gap).toContain("<svg");
      expect(text(gap).trim()).toBe("");
    }
  });

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

  // Two icons after the pill's views say how one looks at space, once the page wakes: the page as written holds none, so a not-found path, served the fallback written at /, hydrates as its own page.
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
  // Each view says what it holds to a screen reader alone, as its description; nothing is drawn under the tabs.
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

  // The default universe's home is the Earth's first screen, no level of the header in view.
  test("marks no level on the home's first screen", async () => {
    expect(current(await header("/"))).toEqual([]);
    expect(await header("/")).not.toContain("aria-current");
  });

  // The addresses `canonical` and `og:url` publish are /net/onyx/ and /net/onyx/earth, and a person can arrive on them.
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

  // "Testnet" is a use of the static chip, in the caution tone with the warning icon (DESIGN-SYSTEM.md, "Severity").
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

  // A phone has no views' pill to hold it: the one search is the account's row's, beside the bell.
  test("keeps search in the account's row alone, none in the views' pill", async () => {
    const html = await header("/earth");
    const pill = /<nav [^>]*aria-label="Views"[^>]*>([\s\S]*?)<\/nav>/.exec(html)?.[1] ?? "";
    expect(pill.indexOf("Earth")).toBeGreaterThan(0);
    expect(pill.indexOf(">Chat<")).toBeGreaterThan(pill.indexOf("Earth"));
    expect(pill).not.toContain('aria-label="Search"');
    expect(html.match(/aria-label="Search"/g)).toHaveLength(1);
  });

  // The chat full of the world in view, or of the Earth, is a control beside the World level, named for its world; no
  // Jarvis, and the passport the account menu's alone.
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
  // The World level is the page's own, a path that holds a chat even when its world is not found (headerPills.tsx's worldAt).
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

// A realm's page names its World level by the realm's last part, its version left out; a path that is no realm's, by itself.
test.each([
  ["/r/gnoswap/access/v1", "access"],
  ["/r/gnoland/blog", "blog"],
  ["/net/gnoland/r/gnoland/blog", "blog"],
  ["/r/demo/boards/v2/", "boards"],
])("%s: the World level is named %s", (path, name) => {
  const world = levelsOf(site.universeAt(path), path).levels.find((level) => level.view === "world");
  expect(world?.name).toBe(name);
});

// "Testnet" says what the data says of a universe, not what a name or a default says. The real data has one testnet and it is
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

// A phone's header is one line (the logo, search, bell, menu): the network and the way in live in the account's menu, where its words
// ("To log in, use a computer…") stand where Adena is not found. The screen is stubbed as the query reads it, part by part.
const api = vi.hoisted(() => ({ me: vi.fn(), logout: vi.fn(), challenge: vi.fn(), verify: vi.fn() }));
vi.mock("./lib/api/login.ts", () => ({ pageLoginApi: () => api }));

describe("the header's menu on a phone", () => {
  beforeAll(() => {
    popovers();
    noObservers();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  const screenOf = ({ width }: { width: number }) => {
    vi.stubGlobal("reportError", vi.fn());
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: query === "(max-width: 899px)" && width < 900,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      })),
    );
  };
  const withAdena = () => {
    vi.stubGlobal("adena", { AddEstablish: () => undefined, version: "1.30.0" });
  };
  // A guest's header, its menu pressed open: the menu, once drawn.
  async function guestMenu() {
    api.me.mockResolvedValue({ ok: true, value: { address: null } });
    const box = mount(
      <MemoryRouter>
        <StoreProvider>
          <ShellHeader universe={site.universeAt("/")} />
        </StoreProvider>
      </MemoryRouter>,
    );
    await settled(() => box.querySelector("button[aria-label='Menu']") !== null);
    act(() => {
      box.querySelector<HTMLButtonElement>("button[aria-label='Menu']")?.click();
    });
    await settled(() => box.querySelector("[role='menu']") !== null);
    return box.querySelector("[role='menu']");
  }
  const items = (menu: Element | null | undefined) =>
    [...(menu?.querySelectorAll("[role^='menuitem']") ?? [])].map((each) => each.textContent);

  test("a phone with no Adena reads the words atop the menu, and no way in", async () => {
    screenOf({ width: 390 });
    const menu = await guestMenu();
    expect(menu?.firstElementChild?.textContent).toBe(USE_A_COMPUTER);
    expect(menu?.getAttribute("aria-describedby")).toBe(menu?.firstElementChild?.id);
    expect(items(menu).join("|")).not.toContain("Connect Adena");
  });

  test("a narrow window where Adena is found offers Connect Adena in the menu, with no words", async () => {
    screenOf({ width: 390 });
    withAdena();
    const menu = await guestMenu();
    expect(items(menu)[0]).toBe("Connect Adena");
    expect(menu?.textContent).not.toContain(USE_A_COMPUTER);
  });

  test("the menu holds the network, its switch the network menu's own, the current one checked", async () => {
    screenOf({ width: 390 });
    const menu = await guestMenu();
    const radios = [...(menu?.querySelectorAll("[role='menuitemradio']") ?? [])];
    expect(radios.map((each) => each.textContent.replace("Testnet", ""))).toEqual(
      site.universes.map((each) => `Network: ${each.name}`),
    );
    expect(radios.filter((each) => each.getAttribute("aria-checked") === "true")).toHaveLength(1);
  });

  const headerOf = async (path: string) => {
    api.me.mockResolvedValue({ ok: true, value: { address: null } });
    const box = mount(
      <MemoryRouter>
        <StoreProvider>
          <ShellHeader universe={site.universeAt(path)} />
        </StoreProvider>
      </MemoryRouter>,
    );
    await settled(() => box.querySelector("button[aria-label='Menu']") !== null);
    return box;
  };

  test("a phone on a testnet keeps Testnet in the header, after the logo: the warm chip alone", async () => {
    screenOf({ width: 390 });
    const box = await headerOf("/");
    const pill = box.querySelector("header [data-testnet]");
    expect(pill?.previousElementSibling?.getAttribute("aria-label")).toBe("gnoworld");
    expect(pill?.querySelector("[data-tone='warm']")?.textContent).toBe("Testnet");
  });

  test("a phone on mainnet, and a computer on a testnet, draw no such pill in the logo's place", async () => {
    screenOf({ width: 390 });
    expect((await headerOf("/net/gnoland")).querySelector("[data-testnet]")).toBeNull();
    screenOf({ width: 1280 });
    expect((await headerOf("/")).querySelector("[data-testnet]")).toBeNull();
  });

  test("a computer's menu has neither the words, the way in nor the network", async () => {
    screenOf({ width: 1280 });
    withAdena();
    const menu = await guestMenu();
    expect(menu?.textContent).not.toContain(USE_A_COMPUTER);
    expect(items(menu).join("|")).not.toMatch(/Connect Adena|Network:/);
  });
});
