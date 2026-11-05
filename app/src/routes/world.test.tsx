// @vitest-environment jsdom
import { data, type ClientLoaderFunctionArgs, type MetaArgs, type RouteObject } from "react-router";
import { use } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { fakeStream } from "../../tests/fakeStream.ts";
import { BACK_HOME, alertOf, render, routeError } from "../../tests/render.tsx";
import { drawRoute, expectStreamClosedOnLeave } from "../../tests/routed.tsx";
import { ChainCard } from "../features/chat/ChainCard.tsx";
import { callsIn } from "../features/chat/chainEntries.ts";
import { ChainCallsContext, ChainPlaceContext } from "../features/chat/chainThread.ts";
import { useVerdicts } from "../features/chat/useVerdicts.ts";
import { useAppStore } from "../storeContext.tsx";
import { failedWorldMeta, worldMeta } from "../meta.ts";
import { site } from "../places.ts";
import World, { clientLoader, ErrorBoundary, loader, meta } from "./world.tsx";

// The page's chat is the real one, but for the test that watches the stream's way to the room: there the chat is the room's wiring alone (its
// stream followed through useVerdicts, its thread's cards drawn from the calls the page gave), the rooms' own service being no business of it.
const probing = vi.hoisted(() => ({ on: false }));
vi.mock(import("../features/chat/index.ts"), async (original) => {
  const actual = await original();
  const Probe = () => {
    useVerdicts(useAppStore(), { room: "#govdao", lines: undefined, reader: undefined, saving: false });
    const place = use(ChainPlaceContext);
    return (
      <ol>
        {callsIn(use(ChainCallsContext), place, "#govdao").map((call) => (
          <ChainCard key={call.id} call={call} />
        ))}
      </ol>
    );
  };
  return {
    ...actual,
    Chat: (props: Parameters<typeof actual.Chat>[0]) => (probing.on ? <Probe /> : <actual.Chat {...props} />),
  };
});

const bubbleOf = () => site.world(new Request("https://gno.world/w/bubble"));
type Bubble = ReturnType<typeof bubbleOf>;
const at = (path: string) =>
  ({ params: {}, request: new Request(`https://gno.world${path}`) }) as unknown as ClientLoaderFunctionArgs;

function route(worldLoader: RouteObject["loader"] = loader): RouteObject {
  return { path: "/w/:world", Component: World, loader: worldLoader, ErrorBoundary };
}

function metaArgs(loaderData: Bubble | undefined, error?: unknown) {
  return { loaderData, error } as MetaArgs<typeof loader>;
}

const failures: [string, () => never][] = [
  [
    "an error",
    () => {
      throw new Error("the chain did not answer");
    },
  ],
  ...[403, 410, 503].map((status): [string, () => never] => [
    `an answer of ${String(status)}`,
    () => {
      throw data(null, { status });
    },
  ]),
];

describe("a world's page", () => {
  // GovDAO has a realm (hubs.json): its page leads with reading the proposals, at the realm's view; Bubble has none.
  test("leads with Read the proposals, at the realm's view, for a world with a realm only", async () => {
    const govdao = await render(route(), "/w/govdao");
    expect(govdao).toMatch(/<a [^>]*href="\/r\/gov\/dao"[^>]*>(?:<svg.*?<\/svg>)?Read the proposals/);
    expect(await render(route(), "/w/bubble")).not.toContain("Read the proposals");
  });

  test("shows the world's name and its description", async () => {
    const html = await render(route(), "/w/bubble");
    expect(html).toContain("<h1>Bubble</h1>");
    expect(html).toContain("the BUBBLE token, its governance");
  });

  // The chat's rooms come from the server once the page runs: the build writes the page waiting for them.
  test("holds the world's chat, its rooms still to load", async () => {
    const html = await render(route(), "/w/bubble");
    expect(html).toMatch(/<p role="status">Loading the chat…<\/p>/);
  });

  // Slice 5p: no world has a capture yet (the capture job is slice 7), so a world's page shows no preview of it: no
  // figure, picture, video, frame or picture of any kind, and no social image in its tags. A preview added here later
  // must come with its capture, and with this test changed in its own commit.
  test("a world with no capture shows no preview: no picture on its page, no og:image in its tags", async () => {
    const html = await render(route(), "/w/bubble");
    expect(html).not.toMatch(/<(figure|picture|img|video|canvas|iframe|object|embed)\b|data-preview/i);
    // The one icon of the main action (frame 26) is a decorative glyph of the design system: no other drawing.
    const drawings = html.match(/<svg\b[^>]*>/gi) ?? [];
    expect(drawings.length).toBeGreaterThan(0);
    for (const drawing of drawings)
      expect(drawing).toMatch(/aria-hidden="true"[^>]*data-icon=|data-icon=[^>]*aria-hidden="true"/);
    const tags = JSON.stringify(meta(metaArgs(bubbleOf())));
    expect(tags).not.toMatch(/og:image|twitter:image|"image"/i);
  });

  test("shows not found, as an alert, for a world that does not exist", async () => {
    const html = await render(route(), "/w/nowhere");
    expect(html).toContain('role="alert"');
    expect(html).toContain("<h1>No world here</h1>");
    expect(html).toContain("<p>No world of gno.land goes by that name.</p>");
    expect(alertOf(html)).toMatch(BACK_HOME);
  });

  test.each(failures)("says it could not load on %s, apart from not found", async (_, failing) => {
    const html = await render(route(failing), "/w/bubble");
    expect(html).toContain('role="alert"');
    expect(html).toContain("<h1>This world could not load</h1>");
    expect(html).toContain("<p>Try again in a moment.</p>");
    expect(alertOf(html)).toMatch(BACK_HOME);
    expect(html).not.toContain("No world here");
  });

  // The app may be what failed: the way home loads the document again (F325).
  test.each(failures)("goes home by loading the document again on %s", async (_, failing) => {
    const html = await render(route(failing), "/w/bubble", { slot: true });
    expect(alertOf(html)).toMatch(BACK_HOME);
    expect(alertOf(html)).not.toContain("data-routed");
  });

  test("goes home through the router from a world that does not exist", async () => {
    expect(alertOf(await render(route(), "/w/nowhere", { slot: true }))).toContain('data-routed=""');
  });

  test("carries a world's tags, or not found's when no world has the name", async () => {
    expect(meta(metaArgs(bubbleOf()))).toEqual(worldMeta(bubbleOf()));
    expect(meta(metaArgs(undefined, await routeError(route(), "/w/nowhere")))).toEqual(worldMeta(undefined));
  });

  test.each(failures)("carries could-not-load tags on %s, not not-found ones", async (_, failing) => {
    const error = await routeError(route(failing), "/w/bubble");
    expect(meta(metaArgs(undefined, error))).toEqual(failedWorldMeta());
  });

  test("finds a world in the browser as at build time, by the request's path", () => {
    expect(clientLoader(at("/w/bubble"))).toEqual(bubbleOf());
    expect(clientLoader(at("/w/bubble"))).toEqual(loader(at("/w/bubble")));
    expect(() => clientLoader(at("/w/nowhere"))).toThrow(expect.objectContaining({ init: { status: 404 } }));
  });

  // Any throw passed the case above; only React Router's 404 selects the not-found page (F382).
  test("throws React Router's 404 in the browser for a world that does not exist", () => {
    expect(() => clientLoader(at("/w/nowhere"))).toThrow(expect.objectContaining({ init: { status: 404 } }));
  });
});

// F376: React Router matches /W/bubble to the world route and the world is found by its name alone: the path's own
// case is checked too, in the browser (React Router 8.4.0 drops `caseSensitive` on the client).
describe("a world's page, by the case of its path (F376)", () => {
  test.each([
    "/W/bubble",
    "/w/Bubble",
    "/W/Bubble",
    "/net/onyx/W/bubble",
    "/NET/onyx/w/bubble",
    "/net/Onyx/w/bubble",
    "/net/ONYX/w/bubble",
    "/net/gnoland/w/bubble",
    "/net/nowhere/w/bubble",
    "/w/__proto__",
  ])("refuses %s in the browser with a 404", (path) => {
    expect(() => clientLoader(at(path))).toThrow(expect.objectContaining({ init: { status: 404 } }));
  });

  test.each(["/w/bubble", "/w/bubble/", "/net/onyx/w/bubble", "/w/bubble?utm=1", "/w/bubble#x"])(
    "still serves %s",
    (path) => {
      expect(clientLoader(at(path))).toEqual(bubbleOf());
    },
  );

  test("refuses /W/bubble at build time too: the page is not served as bubble", async () => {
    const html = await render(route(), "/W/bubble");
    expect(html).toContain("<h1>No world here</h1>");
  });

  test("answers a refused path with tags that are not indexed and name no address", async () => {
    const error = await routeError(route(), "/W/bubble");
    expect(meta(metaArgs(undefined, error))).toEqual(worldMeta(undefined));
  });

  test("never echoes the path it refuses", async () => {
    expect(await render(route(), "/w/__proto__")).not.toContain("__proto__");
  });
});

// Slice 5j (frames 26 and 92): the kicker above the title says where the world is; it replaces the breadcrumb (one way to
// say where you are). The data holds no kind of place (a schema in use, parked), so a world shows its universe alone.
describe("a world's page, its kicker", () => {
  test("names the universe alone, in the one label style, as the plate's first line", async () => {
    const html = await render(route(), "/w/bubble");
    const plate = html.slice(html.indexOf('data-look="plate"'));
    expect(plate).toMatch(/<p class="label[^"]*"[^>]*>(?:<span[^>]*><\/span>)?Onyx<\/p>/);
    expect(plate.indexOf("Onyx")).toBeLessThan(plate.indexOf("<h1"));
  });

  test("replaces the breadcrumb: no trail, no link to the Earth", async () => {
    const html = await render(route(), "/w/bubble");
    expect(html).not.toMatch(/aria-label="You are here"/);
    expect(html).not.toMatch(/<a [^>]*href="\/earth"[^>]*>Earth<\/a>/);
  });
});

// Slice 5r (frames 90 to 97, 102 to 107): a world's page is a plate, with no 3D and the chat's slot as it was.
describe("a world's plate", () => {
  const plateOf = async () => {
    const html = await render(route(), "/w/bubble");
    return { html, tag: /<section [^>]*data-look="plate"[^>]*>/.exec(html)?.[0] ?? "" };
  };

  test("is a plate named for the world, holding the one heading, the description and the kicker", async () => {
    const { html, tag } = await plateOf();
    expect(tag).toContain('aria-label="Bubble"');
    const inside = html.slice(html.indexOf(tag));
    expect(inside.indexOf("<h1")).toBeGreaterThan(0);
    expect(inside.indexOf("the BUBBLE token, its governance")).toBeGreaterThan(inside.indexOf("<h1"));
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    // The kicker is part of the plate: it opens before the plate closes.
    const plate = inside.slice(0, inside.indexOf("</section>"));
    expect(plate).toMatch(/class="label[^"]*"[^>]*>(?:<span[^>]*><\/span>)?Onyx</);
  });

  test("says its kind in its vertical caption, to the eye only", async () => {
    const { html } = await plateOf();
    expect(html).toMatch(/gnoworld[^<]*hub/i);
    expect(html).toMatch(/aria-hidden="true"[^>]*><p [^>]*>gnoworld/);
  });

  test("shows no figure, chart or planet the data does not hold: no sample numbers, no 3D", async () => {
    const { html } = await plateOf();
    expect(html).not.toMatch(/here now|messages now|<canvas\b|data-value=|data-hour=/i);
  });

  // Share needs the browser's clipboard, unknown to the build: the page it writes has no Share, and never a Follow (no
  // account's store to follow into). The connected worlds and the chart's words follow what the data holds: no link, no block.
  test("offers no Follow, and no Share in the page the build writes", async () => {
    const { html } = await plateOf();
    expect(html).not.toMatch(/>Follow<|>Share</);
  });

  test("has no connected worlds block: Bubble links to no world", async () => {
    const { html } = await plateOf();
    expect(html).not.toMatch(/connected worlds/i);
  });

  test("says in words that no activity is known, with no chart, until the chat has history", async () => {
    const { html } = await plateOf();
    expect(html).toMatch(/no activity (recorded|known) yet/i);
  });

  // The main action is the link to the world's chat, named for what it does: it fails while the plate's only link is a trail.
  test("has a main action: a link in the plate to the chat on the page, which the page holds", async () => {
    const { tag, html } = await plateOf();
    const plate = html.slice(html.indexOf(tag), html.indexOf("</section>", html.indexOf(tag)));
    const links = [...plate.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)];
    expect(links.map(([, href]) => href)).toEqual(["#chat"]);
    expect(links[0]?.[2]).toMatch(/Say hi in the chat/);
    expect(html).toMatch(/<div id="chat"[^>]*>/);
  });

  // F2865: the page reads and tabs in the order it is drawn on a computer, the plate first; a phone draws the chat above it by CSS
  // alone (worldPage.spec.ts).
  test("keeps the chat's slot in the page, after the plate opens", async () => {
    const { html } = await plateOf();
    expect(html).toMatch(/<section [^>]*data-look="plate"[\s\S]*<div id="chat"[^>]*>[\s\S]*Loading the chat/);
  });
});

// Slice 9g (F5784, frames 20 to 35): a world's page follows its main room's stream once it has run, and the room draws as a card the call
// the stream tells for its own world and universe, never one of another's.
describe("a world's page and the chain's stream", () => {
  afterEach(() => {
    probing.on = false;
    vi.unstubAllGlobals();
  });
  const call = (id: string, world: string, universe = "onyx") => ({
    id,
    kind: "call",
    universe,
    world,
    realm: "gno.land/r/gov/dao",
    func: "MustVoteOnProposal",
    actor: "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv",
    height: 900030,
  });

  test("follows its room, draws a call of its world as a card, and none of another world's or universe's", async () => {
    probing.on = true;
    const sources = fakeStream();
    const { box } = drawRoute(route(), "/w/govdao");
    await vi.waitFor(() => {
      expect(sources.opened.map(({ url }) => url)).toEqual(["/api/stream?rooms=%23govdao"]);
    });
    sources.opened[0]?.emit("chain", call("a:0", "bubble"));
    sources.opened[0]?.emit("chain", call("b:0", "govdao", "gnoland"));
    sources.opened[0]?.emit("chain", call("c:0", "govdao"));
    await vi.waitFor(() => {
      expect(box.querySelectorAll("[data-chain]")).toHaveLength(1);
    });
    expect(box.querySelector("[data-chain]")?.textContent).toContain("g10gh7…y5tv called MustVoteOnProposal");
  });

  test("closes the stream when the page is left", async () => {
    probing.on = true;
    await expectStreamClosedOnLeave(route(), "/w/govdao");
  });
});
