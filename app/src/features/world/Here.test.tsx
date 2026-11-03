// @vitest-environment jsdom
import { parseLine, type IrcMessage } from "@gnoworld/core";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StoreProvider, useAppStore } from "../../storeContext.tsx";
import { Here } from "./Here.tsx";

// F2868 (the chief's decision): "here, right now" is the people the chat's rooms list once it has connected; before that, and
// with nobody listed, the plate draws no fact, never a 0. The rate is left out: no source gives messages an hour.
const ME = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const read = (line: string): IrcMessage => {
  const parsed = parseLine(line);
  if (!parsed.ok) throw new Error(`the test's line does not parse: ${line}`);
  return parsed.message;
};

let root: Root | undefined;
let host: HTMLElement | undefined;
const grabbed: { store?: ReturnType<typeof useAppStore> } = {};
function Grab() {
  const here = useAppStore();
  useEffect(() => {
    grabbed.store = here;
  });
  return null;
}
const held = () => {
  if (grabbed.store === undefined) throw new Error("nothing drawn");
  return grabbed.store.getState().chatActions;
};
const labels = () => [...(host?.querySelectorAll(".label") ?? [])].map((node) => node.textContent);

beforeEach(() => {
  vi.stubGlobal("matchMedia", (media: string) => ({ matches: false, media }));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root?.render(
      <StoreProvider>
        <Grab />
        <Here />
      </StoreProvider>,
    );
  });
});
afterEach(() => {
  act(() => {
    root?.unmount();
  });
  vi.unstubAllGlobals();
  host?.remove();
});

describe("who is here, from the chat's store", () => {
  it("draws nothing before the chat has connected", () => {
    act(() => {
      held().follow(["#bubble"]);
    });
    expect(labels()).toEqual([]);
  });

  it("draws nothing once connected with nobody listed, and never a 0", () => {
    act(() => {
      held().follow(["#bubble"]);
      held().connected(ME);
    });
    expect(host?.textContent).toBe("");
  });

  it("keeps its place, empty, until someone is counted, and draws the fact in it: the plate under it never moves (7e)", async () => {
    const place = host?.firstElementChild;
    expect(place, "a place before the chat has connected").toBeInstanceOf(HTMLElement);
    expect(place?.textContent).toBe("");
    act(() => {
      held().follow(["#bubble"]);
      held().connected(ME);
      held().heard(read(`:${ALICE}!u@h JOIN #bubble`));
    });
    await vi.waitFor(() => {
      expect(labels()).toContain("right now");
    });
    expect(host?.firstElementChild, "the fact in the same place").toBe(place);
    expect(place?.querySelector(".label")?.textContent).toBe("right now");
  });

  // From 1,280 px the stylesheet frees an empty place (Alexis, 2026-11-03): `:empty` matches only an element with no child, text included.
  it("leaves its place without a child while nobody is counted, so the plate's breakpoint can free it", () => {
    const place = host?.firstElementChild;
    expect(place?.matches(":empty")).toBe(true);
    act(() => {
      held().follow(["#bubble"]);
      held().connected(ME);
    });
    expect(place?.matches(":empty")).toBe(true);
  });

  it("counts the distinct people of the rooms followed, once the chat has connected, and writes no rate", async () => {
    act(() => {
      held().follow(["#bubble", "#bubble/games"]);
      held().connected(ME);
      held().heard(read(`:${ME}!u@h JOIN #bubble`));
      held().heard(read(`:${ALICE}!u@h JOIN #bubble`));
      held().heard(read(`:${ME}!u@h JOIN #bubble/games`));
    });
    await vi.waitFor(() => {
      expect(labels()).toContain("right now");
    });
    expect(host?.querySelector("[data-value]")?.getAttribute("data-value")).toBe("2");
    expect(labels()).not.toContain("messages now");
  });
});
