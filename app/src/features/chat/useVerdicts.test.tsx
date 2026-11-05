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
const SINCE = { time: "2026-10-26T12:00:00.000Z" };

const line = (id: string, text: string): Line => ({
  id,
  time: "2026-10-26T11:00:00.000Z",
  from: "a",
  text,
  kind: "message",
});
const settled = () => new Promise((resolve) => setTimeout(resolve, 20));

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
function Probe({ shown }: { shown: Shown }) {
  useVerdicts(store, shown);
  return null;
}

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
    await act(async () => {
      mounted.render(<Probe shown={{ room: "#bubble", lines, reader: undefined, saving }} />);
      await settled();
    });
    return sources;
  };

  it("follows the room's stream before any line, and asks nothing", async () => {
    const sources = await draw([]);
    expect(sources.opened.map(({ url }) => url)).toEqual(["/api/stream?rooms=%23bubble"]);
    expect(asked).toEqual([]);
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
    expect(sources.opened[0]?.heard()).toEqual(["chain", "error", "realms", "signal", "since", "verdict"]);
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
