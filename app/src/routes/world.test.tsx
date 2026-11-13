// @vitest-environment jsdom
import { data, type ClientLoaderFunctionArgs, type MetaArgs, type RouteObject } from "react-router";
import { use } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fakeStream } from "../../tests/fakeStream.ts";
import { expectFollowAndShare } from "../../tests/plateButtons.ts";
import { noMedia, noObservers } from "../../tests/mount.tsx";
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
// The shell's host draws it (routed.tsx), the chain's contexts given from what the page holds.
const NO_CALLS: readonly never[] = [];
const probing = vi.hoisted(() => ({ on: false, place: undefined as { slug: string } | undefined }));
vi.mock(import("../features/chat/Chat.tsx"), async (original) => {
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
    Chat: (props: Parameters<typeof actual.Chat>[0]) => {
      probing.place = props.place;
      if (!probing.on) return <actual.Chat {...props} />;
      return (
        <ChainPlaceContext value={props.chain?.place}>
          <ChainCallsContext value={props.chain?.calls ?? NO_CALLS}>
            <Probe />
          </ChainCallsContext>
        </ChainPlaceContext>
      );
    },
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

// The page holds the space behind it, which asks the screen's media.
beforeEach(() => {
  noMedia();
  noObservers();
});

// The plate's blocks are a chunk asked once the page has loaded (world.tsx's `loaded`, D567): the build writes the frame, the kicker and the
// title; the lede, the actions and the figures are drawn in the DOM once it has run, the chain not answering.
const drawn = async (path: string, ready: string) => {
  fakeStream();
  vi.stubGlobal("fetch", () => Promise.reject(new Error("offline")));
  const page = drawRoute(route(clientLoader), path);
  await vi.waitFor(() => {
    expect(page.box.textContent).toContain(ready);
  });
  return { ...page, plate: page.box.querySelector("section[data-look='plate']") };
};

describe("a world's page", () => {
  // GovDAO has a realm (hubs.json): its page leads with reading the proposals, at the realm's view; Bubble has none.
  test("leads with Read the proposals, at the realm's view, for a world with a realm only", async () => {
    const govdao = await drawn("/w/govdao", "the votes that accept or refuse them");
    expect(govdao.plate?.querySelector("a[href='/r/gov/dao']")?.textContent).toBe("Read the proposals");
    govdao.leave();
    const bubble = await drawn("/w/bubble", "the BUBBLE token");
    expect(bubble.box.textContent).not.toContain("Read the proposals");
  });

  test("shows the world's name and its description", async () => {
    const html = await render(route(), "/w/bubble");
    expect(html).toContain("<h1>Bubble</h1>");
    expect(html).toContain("the BUBBLE token, its governance");
  });

  // 7e: the world's planet stands beside the plate as the Earth's does, in a place the page keeps while the scene may yet come.
  test("keeps the place of the world's planet, waiting for the scene", async () => {
    for (const path of ["/w/bubble", "/w/govdao"])
      expect(await render(route(), path)).toMatch(/<div[^>]*data-globe[^>]*data-world="waiting"[^>]*><\/div>/);
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
    // The main action's icon (frame 26) comes with the plate's chunk: the first paint draws nothing at all.
    expect(html).not.toMatch(/<svg\b/i);
    const tags = JSON.stringify(meta(metaArgs(bubbleOf())));
    expect(tags).not.toMatch(/og:image|twitter:image|"image"/i);
  });

  test("shows not found, as an alert, for a world that does not exist", async () => {
    const html = await render(route(), "/w/nowhere");
    expect(html).toContain('role="alert"');
    expect(html).toContain("<h1>No world here</h1>");
    expect(html).toContain("You are lost in space: no world of gno.world goes by that address.");
    expect(alertOf(html)).toMatch(BACK_HOME);
  });

  test.each(failures)("says its own failure on %s, apart from not found", async (_, failing) => {
    const html = await render(route(failing), "/w/bubble");
    expect(html).toContain('role="alert"');
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

// Slice 5j, 8g (frames 22, 93, 104): the plate's kicker says what the world is, "GAMES · DAPP"; a world the data gives no kind is a hub. The crumb
// "Universe > Games > dApp" is gone with the plate's rebuild (D428, D567): the header's levels say where it is (the plan space-simple).
describe("a world's page, its kicker", () => {
  const kickerOf = async (path: string) => {
    const html = await render(route(), path);
    const plate = html.slice(html.indexOf('data-look="plate"'));
    return { plate, kicker: />([^<>]+)<\/p><\/div><\/div><div [^>]*data-title/.exec(plate)?.[1] };
  };

  test("says the genre and the kind, in that order, before the title, and no crumb", async () => {
    const { plate, kicker } = await kickerOf("/w/bubble");
    expect(kicker).toBe("Games · dApp");
    expect(plate).not.toContain("You are here");
    expect(plate).not.toMatch(/<a [^>]*href="\/"[^>]*>Universe<\/a>/);
  });

  test("says DAO for GovDAO, with no genre", async () => {
    expect((await kickerOf("/w/govdao")).kicker).toBe("DAO");
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
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    // The description is the plate's chunk's (D567), drawn after the title, in the plate.
    const { plate, box } = await drawn("/w/bubble", "the BUBBLE token, its governance");
    expect(box.querySelectorAll("h1")).toHaveLength(1);
    expect(plate?.textContent).toContain("Games · dApp");
    const text = plate?.textContent ?? "";
    expect(text.indexOf("the BUBBLE token, its governance")).toBeGreaterThan(text.indexOf("Bubble"));
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

  // Follow and Share are the plate's chunk's, in words (D13915 reverses D536's icons): the build writes neither, nor a Share the clipboard
  // of the build could not serve.
  test("offers Follow and Share once the plate has come, and the build writes neither", async () => {
    expect((await plateOf()).html).not.toMatch(/>(Follow|Share)</);
    const { plate } = await drawn("/w/bubble", "the BUBBLE token");
    expectFollowAndShare(plate);
  });

  test("has no connected worlds block: Bubble links to no world", async () => {
    const { html } = await plateOf();
    expect(html).not.toMatch(/connected worlds/i);
  });

  // The plate's first figure, who is here now (the activity chart's frame, "0 msgs/h now", is gone with the plate's rebuild): 0 while no room told.
  test("shows who is here now as 0 while no count has come, with no bars", async () => {
    const { plate } = await drawn("/w/bubble", "the BUBBLE token");
    const figures = plate?.querySelector("section[aria-label='Figures']");
    expect(figures?.textContent).toContain("Here now");
    expect(figures?.textContent).toContain("people in the world");
    expect(plate?.querySelector("[data-hour]")).toBeNull();
  });

  // The main action is the link to the world's chat, named for what it does: it fails while the plate's only link is a trail.
  test("has a main action: a link in the plate to the chat on the page, which the page holds", async () => {
    const { plate, box } = await drawn("/w/bubble", "the BUBBLE token");
    const links = [...(plate?.querySelectorAll("a") ?? [])];
    // The crumb's link to the universe is gone (D428): the one action is the plate's only link for a world with no realm.
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["#chat"]);
    expect(links[0]?.textContent).toBe("Say hi in the chat");
    expect(box.querySelector("#chat")).not.toBeNull();
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
// The chat comes once space's door has, 2.5 s at most (useSpace's FIRST_SCREEN_MS), and with it the room's stream: here no scene draws.
const DOOR = 4_000;
describe("a world's page and the chain's stream", () => {
  afterEach(() => {
    probing.on = false;
    probing.place = undefined;
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
    await vi.waitFor(
      () => {
        expect(sources.opened.map(({ url }) => url)).toEqual(["/api/stream?rooms=%23govdao"]);
      },
      { timeout: DOOR },
    );
    sources.opened[0]?.emit("chain", call("a:0", "bubble"));
    sources.opened[0]?.emit("chain", call("b:0", "govdao", "gnoland"));
    sources.opened[0]?.emit("chain", call("c:0", "govdao"));
    await vi.waitFor(() => {
      expect(box.querySelectorAll("[data-chain]")).toHaveLength(1);
    });
    expect(box.querySelector("[data-chain]")?.textContent).toContain("g10gh7…3y5tv called MustVoteOnProposal");
  });

  test("gives the chat its place: the world, its kicker, its way home and the worlds beside it", async () => {
    probing.on = true;
    fakeStream();
    drawRoute(route(), "/w/govdao");
    await vi.waitFor(
      () => {
        expect(probing.place).toBeDefined();
      },
      { timeout: DOOR },
    );
    // GovDAO pins Vote (D271): the chat's bar has its pills and cards too, apart from what the place says.
    expect(probing.place).toHaveProperty("pinned");
    expect({ ...probing.place, pinned: undefined }).toMatchObject({
      slug: "govdao",
      name: "GovDAO",
      description: "GovDAO, the governance of gno.land: its proposals and the votes that accept or refuse them.",
      kicker: "Onyx · GovDAO",
      home: "/",
      worlds: [
        { slug: "earth", name: "Earth", href: "/earth" },
        { slug: "bubble", name: "Bubble", href: "/w/bubble" },
        { slug: "govdao", name: "GovDAO", href: "/w/govdao" },
        // The stations round the Earth are no place while STATIONS_SHOWN is off (places.ts): the worlds beside it are Bubble and GovDAO.
      ],
    });
  });

  test("reads the proposals under the plate for a world with a realm, which the realm's own read fails to give here, and for no other", async () => {
    probing.on = true;
    fakeStream();
    vi.stubGlobal("fetch", () => Promise.reject(new Error("offline")));
    const govdao = drawRoute(route(), "/w/govdao");
    await vi.waitFor(() => {
      expect(govdao.box.textContent).toContain("Read them on gnoweb");
    });
    govdao.leave();
    const bubble = drawRoute(route(), "/w/bubble");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(bubble.box.textContent).not.toContain("Read them on gnoweb");
  });

  test("closes the stream when the page is left", async () => {
    probing.on = true;
    await expectStreamClosedOnLeave(route(), "/w/govdao", DOOR);
  });
});
