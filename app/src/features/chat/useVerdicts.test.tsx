// @vitest-environment jsdom
import type { Line } from "@gnoworld/core";
import { Address, type Signal } from "@gnoworld/schemas";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeStream } from "../../../tests/fakeStream.ts";
import { BATCH_MS } from "../../lib/stream/chainFeed.ts";
import { chainKey } from "../../store/chain.ts";
import { createAppStore } from "../../store/index.ts";
import { tellJarvisHere } from "../../jarvisHere.ts";
import { translationNow } from "../../translating.ts";
import { cardsIn } from "./cardsIn.ts";
import { useVerdicts, type Shown } from "./useVerdicts.ts";

// The verdicts' asker reads a line's Markdown for a player's link: that code is asked once a room holds a line, never
// with the first screen (ADR-0001 §12), while the room's stream is followed as the room is shown.
const asked: string[][] = [];
vi.mock("../../lib/api/verdicts.ts", () => ({
  pageVerdictsApi: () => ({
    verdicts: (_room: string, ids: readonly string[]) => {
      asked.push([...ids]);
      return Promise.resolve({ ok: true, value: { room: "#bubble", verdicts: [] } });
    },
  }),
}));
// The chunk that finds a link in a line, held back until a test opens it (the first import only: a module is loaded once), and the
// times it was asked for.
const chunk = vi.hoisted(() => {
  let open: () => void = () => undefined;
  return {
    loads: 0,
    gate: new Promise<void>((resolve) => {
      open = resolve;
    }),
    open: () => {
      open();
    },
  };
});
vi.mock(import("./linked.ts"), async (original) => {
  chunk.loads += 1;
  await chunk.gate;
  return original();
});
const SINCE = { time: "2026-10-26T12:00:00.000Z" };

const line = (id: string, text: string): Line => ({
  id,
  time: "2026-10-26T11:00:00.000Z",
  from: "a",
  text,
  kind: "message",
});
const pausedBriefly = () => new Promise((resolve) => setTimeout(resolve, 20));

const CHART: Signal = {
  kind: "chart",
  world: "bubble",
  account: Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv"),
  at: "2026-11-05T12:00:00.000Z",
};
const CALL = {
  id: "h900030:0",
  kind: "call",
  universe: "onyx",
  world: "bubble",
  realm: "gno.land/r/gov/dao",
  func: "MustVoteOnProposal",
  actor: "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv",
  height: 900030,
};

let store = createAppStore();
let root: Root | undefined;
function Probe({ shown, using }: { shown: Shown; using: typeof store }) {
  useVerdicts(using, shown);
  return null;
}
// Draws the hook again with other lines, another saving choice or another store, as a page that changes would.
let redraw: (change: Partial<Shown & { using: typeof store }>) => void = () => undefined;

beforeEach(() => {
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
  store = createAppStore();
});
afterEach(() => {
  asked.length = 0;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (root !== undefined) {
    const mounted = root;
    act(() => {
      mounted.unmount();
    });
    root = undefined;
  }
});

describe("useVerdicts: the code that finds a link in a line, asked with the first lines", () => {
  const draw = async (lines: readonly Line[] | undefined, saving = false) => {
    const sources = fakeStream();
    const host = document.createElement("div");
    root = createRoot(host);
    const mounted = root;
    let now: Shown & { using: typeof store } = { room: "#bubble", lines, reader: undefined, saving, using: store };
    redraw = (change) => {
      now = { ...now, ...change };
      mounted.render(<Probe shown={now} using={now.using} />);
    };
    await act(async () => {
      redraw({});
      await pausedBriefly();
    });
    return sources;
  };

  // The first two of the file: the code is loaded once, held back until the second test opens it, and every test after it finds it there.
  it("never loads the code for a room that holds no line, and none for lines before there is one", async () => {
    await draw(undefined);
    await act(async () => {
      redraw({ lines: [] });
      await pausedBriefly();
    });
    expect(chunk.loads).toBe(0);
  });

  it("does not follow a room it has left again when the code comes late", async () => {
    const link = "https://youtu.be/dQw4w9WgXcQ";
    const sources = await draw([line("a", link)]);
    await act(async () => {
      redraw({ room: "#other", lines: [line("x", link)] });
      await pausedBriefly();
    });
    expect(chunk.loads).toBe(1);
    chunk.open();
    await act(async () => {
      await pausedBriefly();
    });
    expect(sources.opened.map(({ url }) => url)).toEqual(["/api/stream?rooms=%23bubble", "/api/stream?rooms=%23other"]);
  });

  it("asks of a new line at once when the code is there, and not of a line whose verdict the store holds", async () => {
    const link = "https://youtu.be/dQw4w9WgXcQ";
    store.getState().verdictActions.judged({ msgid: "held", room: "#bubble", state: "checked" });
    const sources = await draw([line("a", link)]);
    sources.opened[0]?.emit("since", SINCE);
    await vi.waitFor(() => {
      expect(asked).toEqual([["a"]]);
    });
    act(() => {
      redraw({ lines: [line("a", link), line("held", link), line("c", link)] });
    });
    expect(asked).toEqual([["a"], ["c"]]);
  });

  it("follows again for another store, and stops following for a reader who saves data", async () => {
    const sources = await draw([]);
    const second = createAppStore();
    act(() => {
      redraw({ using: second, lines: [] });
    });
    expect(sources.opened.map(({ closed }) => closed)).toEqual([1, 0]);
    act(() => {
      redraw({ saving: true, lines: [] });
    });
    expect(sources.opened.map(({ closed }) => closed)).toEqual([1, 1]);
    expect(sources.opened).toHaveLength(2);
  });

  it("follows the room's stream before any line, and asks nothing", async () => {
    const sources = await draw([]);
    expect(sources.opened.map(({ url }) => url)).toEqual(["/api/stream?rooms=%23bubble"]);
    expect(asked).toEqual([]);
  });

  it("asks the stream for a signed-in reader's language, and holds the translations it tells", async () => {
    tellJarvisHere({ room: "#bubble", universe: { id: "u", isDefault: true }, account: "g1x", language: "de" });
    const sources = await draw([]);
    tellJarvisHere(undefined);
    expect(sources.opened.map(({ url }) => url)).toEqual(["/api/stream?rooms=%23bubble&language=de"]);
    sources.opened[0]?.emit("translation", {
      room: "#bubble",
      msgid: "t-from-stream",
      language: "de",
      status: "translated",
      text: "Hallo",
    });
    expect(translationNow({ room: "#bubble", id: "t-from-stream", language: "de" })).toMatchObject({
      state: "done",
      text: "Hallo",
    });
  });

  it("asks the server of the line that holds a link, once the code came, and of none other", async () => {
    const sources = await draw([line("a", "https://youtu.be/dQw4w9WgXcQ"), line("b", "only words")]);
    sources.opened[0]?.emit("since", SINCE);
    // The chunk's first import takes the time of its transform.
    await vi.waitFor(() => {
      expect(asked).toEqual([["a"]]);
    });
    expect(sources.opened).toHaveLength(1);
  });

  // Slice 9h (D215): the world's arrival banners ride the stream this follows, so the page holds one stream, not two.
  it("hands the stream's first signals to the store, through the one stream it follows", async () => {
    const sources = await draw([]);
    sources.opened[0]?.emit("signal", CHART);
    expect(store.getState().signals.map(({ world, kind }) => `${world} ${kind}`)).toEqual(["bubble chart"]);
    expect(sources.opened[0]?.heard()).toEqual([
      "card",
      "chain",
      "error",
      "realms",
      "signal",
      "since",
      "translation",
      "verdict",
    ]);
  });

  it("hands a verdict of the stream to the store", async () => {
    const sources = await draw([]);
    sources.opened[0]?.emit("verdict", { msgid: "m1", room: "#bubble", state: "checked" });
    expect(store.getState().verdicts["#bubble"]?.["m1"]).toBeDefined();
  });

  // Slice 9g (F5784): the chain's frames of the page's own stream reach the store, in a batch, through the lazily loaded feed.
  it("hands a chain frame and a realms frame to the store, the call in its world's lines and the count at once", async () => {
    const sources = await draw([]);
    sources.opened[0]?.emit("chain", CALL);
    sources.opened[0]?.emit("realms", { universe: "onyx", count: 17, height: 908297 });
    await vi.waitFor(() => {
      expect(store.getState().chainByWorld[chainKey("onyx", "bubble")]?.map(({ id }) => id)).toEqual(["h900030:0"]);
      expect(store.getState().realmsDeployed["onyx"]?.count).toBe(17);
    });
  });

  // Link previews L4: a `card` frame reaches the store through its lazily loaded feed, in the order it came; one it cannot read is said once.
  it("hands a card frame to the store, a later one without a key taking the card away", async () => {
    const sources = await draw([]);
    const key = "a".repeat(64);
    sources.opened[0]?.emit("card", { room: "#bubble", msgid: "m1", key });
    await vi.waitFor(() => {
      expect(cardsIn(store.getState())?.cards["#bubble"]).toEqual({ m1: key });
    });
    sources.opened[0]?.emit("card", { room: "#bubble", msgid: "m1", key: null });
    await vi.waitFor(() => {
      expect(cardsIn(store.getState())?.cards["#bubble"]).toEqual({});
    });
  });

  it("says a card frame it cannot read once, and keeps the store as it was", async () => {
    const report = vi.fn();
    vi.stubGlobal("reportError", report);
    const sources = await draw([]);
    sources.opened[0]?.emit("card", { room: "#bubble", msgid: "m1", key: "../x" });
    sources.opened[0]?.emit("card", { room: "#bubble", msgid: "m2", key: "../y" });
    await vi.waitFor(() => {
      expect(report).toHaveBeenCalledTimes(1);
    });
    expect(String(report.mock.calls[0]?.[0])).toContain("card_unknown");
    expect(cardsIn(store.getState())).toBeUndefined();
  });

  it("says a chain frame it cannot read once, and keeps the store as it was", async () => {
    const report = vi.fn();
    vi.stubGlobal("reportError", report);
    const sources = await draw([]);
    sources.opened[0]?.emit("chain", { ...CALL, func: "<b>" });
    sources.opened[0]?.emit("chain", { ...CALL, func: "<i>" });
    await vi.waitFor(() => {
      expect(report).toHaveBeenCalledTimes(1);
    });
    expect(String(report.mock.calls[0]?.[0])).toContain("chain_unknown");
    expect(store.getState().chainByWorld).toEqual({});
  });

  it("closes the stream when the page leaves, and a frame held by then reaches no store", async () => {
    const sources = await draw([]);
    sources.opened[0]?.emit("chain", CALL);
    await vi.waitFor(() => {
      expect(store.getState().chainByWorld).not.toEqual({});
    });
    sources.opened[0]?.emit("chain", { ...CALL, id: "h900031:0", height: 900031 });
    const mounted = root;
    act(() => {
      mounted?.unmount();
    });
    root = undefined;
    await new Promise((resolve) => setTimeout(resolve, BATCH_MS * 3));
    expect(sources.opened[0]?.closed).toBe(1);
    expect(store.getState().chainByWorld[chainKey("onyx", "bubble")]).toHaveLength(1);
  });

  it("follows nothing, opens no stream, for a reader who saves data", async () => {
    const sources = await draw([line("a", "https://youtu.be/dQw4w9WgXcQ")], true);
    expect(sources.opened).toEqual([]);
    expect(asked).toEqual([]);
  });
});
