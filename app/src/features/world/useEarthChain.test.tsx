// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Grab, state } from "../../../tests/grabStore.tsx";
import { fakeStream } from "../../../tests/fakeStream.ts";
import { BATCH_MS } from "../../lib/stream/chainFeed.ts";
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
      expect(sources.opened.map(({ url }) => url)).toEqual(["/api/stream?rooms=%23earth"]);
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
});
