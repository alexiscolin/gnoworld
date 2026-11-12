// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Grab, state } from "../../../tests/grabStore.tsx";
import { fakeStream } from "../../../tests/fakeStream.ts";
import { BATCH_MS } from "../../lib/stream/chainFeed.ts";
import { BUSY_REST_MS } from "../../lib/stream/verdicts.ts";
import { StoreProvider } from "../../storeContext.tsx";
import { useEarthChain } from "./useEarthChain.ts";

// Slice 9g (F5784): a page with no chat (the home, the Earth) follows the Earth's room after it has hydrated, in a chunk of its own: the
// realms count and the deploys of the one stream reach the store, and the stream is closed when the page leaves.
const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const DEPLOY = {
  id: "h887427:0",
  kind: "deploy",
  universe: "onyx",
  realm: `gno.land/r/${ALICE}/counter`,
  actor: ALICE,
  height: 887427,
};

function Probe() {
  useEarthChain();
  return <Grab />;
}

// The page drawn, and the way it leaves.
function draw() {
  const root = createRoot(document.createElement("div"));
  act(() => {
    root.render(
      <StoreProvider>
        <Probe />
      </StoreProvider>,
    );
  });
  return () => {
    act(() => {
      root.unmount();
    });
  };
}

beforeEach(() => {
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useEarthChain", () => {
  it("follows the Earth's room alone once the chunk came, and hears the count, the deploys and the verdicts of no room", async () => {
    const sources = fakeStream();
    draw();
    expect(sources.opened).toEqual([]);
    await vi.waitFor(() => {
      expect(sources.opened.map(({ url }) => url)).toEqual(["/api/stream?rooms=%23earth&presence=0"]);
    });
    const [source] = sources.opened;
    source?.emit("realms", { universe: "onyx", count: 17, height: 908297 });
    source?.emit("chain", DEPLOY);
    expect(state().realmsDeployed["onyx"]?.count).toBe(17);
    await vi.waitFor(() => {
      expect(state().deploys.map(({ id }) => id)).toEqual(["h887427:0"]);
    });
    expect(source?.heard()).toEqual(["chain", "error", "realms", "since", "verdict"]);
  });

  it("closes the stream when the page leaves, and a deploy held by then reaches no store", async () => {
    const sources = fakeStream();
    const leave = draw();
    await vi.waitFor(() => {
      expect(sources.opened).toHaveLength(1);
    });
    sources.opened[0]?.emit("chain", DEPLOY);
    leave();
    await new Promise((resolve) => setTimeout(resolve, BATCH_MS * 3));
    expect(sources.opened[0]?.closed).toBe(1);
    expect(state().deploys).toEqual([]);
  });

  it("follows nothing when the page left before the chunk came", async () => {
    const sources = fakeStream();
    const leave = draw();
    leave();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(sources.opened).toEqual([]);
  });

  // The server answered 429 (too many streams): the browser gave the stream up, and the ticker followed nothing for good.
  // Each test: the page drawn, its first stream refused, the timers faked; the rest runs `after` it.
  async function refused(after: (sources: ReturnType<typeof fakeStream>, leave: () => void) => void) {
    const sources = fakeStream();
    const leave = draw();
    await vi.waitFor(() => {
      expect(sources.opened).toHaveLength(1);
    });
    const [first] = sources.opened;
    if (first) first.readyState = 2;
    vi.useFakeTimers();
    try {
      first?.emit("error", {});
      after(sources, leave);
    } finally {
      vi.useRealTimers();
    }
  }

  it("follows the room again after the route's minute when the server refused its stream, not at once", async () => {
    await refused((sources) => {
      vi.advanceTimersByTime(BUSY_REST_MS - 1);
      expect(sources.opened).toHaveLength(1);
      vi.advanceTimersByTime(1);
      expect(sources.opened.map(({ url }) => url)).toEqual(Array(2).fill("/api/stream?rooms=%23earth&presence=0"));
    });
  });

  it("asks nothing again once the page left while the stream rested", async () => {
    await refused((sources, leave) => {
      leave();
      vi.advanceTimersByTime(BUSY_REST_MS * 2);
      expect(sources.opened).toHaveLength(1);
    });
  });
});
