// @vitest-environment jsdom
import { Address, type Signal } from "@gnoworld/schemas";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Grab, state } from "../../../tests/grabStore.tsx";
import { StoreProvider } from "../../storeContext.tsx";
import { FirstCharted } from "./FirstCharted.tsx";

// Slice 9h (frame 91's plate: "First charted by @name"): the plate says who charted the world, for every reader, from
// the signals' slice; plain text, and nothing until the server has said who.
const ME = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const AT = "2026-11-05T12:00:00.000Z";

let root: Root | undefined;
let host: HTMLElement | undefined;
const actions = () => state().signalActions;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root?.render(
      <StoreProvider>
        <Grab />
        <FirstCharted world="fresh-mint" />
      </StoreProvider>,
    );
  });
});
afterEach(() => {
  act(() => {
    root?.unmount();
  });
  host?.remove();
});

describe("First charted by", () => {
  it("draws nothing until the server has said who charted the world, and never a guess", () => {
    expect(host?.textContent).toBe("");
  });

  it("names the account that charted it, by its short address, as plain text", () => {
    act(() => {
      actions().firstsRead({ world: "fresh-mint", charted: { account: Address.parse(ME), at: AT }, words: null });
    });
    expect(host?.textContent).toBe("First charted by @g1jg8m…vsqf5");
    expect(host?.querySelector("a, button, img")).toBeNull();
  });

  it("names it from a signal of the stream too, and not for another world's", () => {
    const signal: Signal = { kind: "chart", world: "govdao", account: Address.parse(ME), at: AT };
    act(() => {
      actions().signaled(signal);
    });
    expect(host?.textContent).toBe("");
    act(() => {
      actions().signaled({ ...signal, world: "fresh-mint" });
    });
    expect(host?.textContent).toBe("First charted by @g1jg8m…vsqf5");
  });

  it("says nothing of a world whose first words alone are known", () => {
    act(() => {
      actions().firstsRead({ world: "fresh-mint", charted: null, words: { account: Address.parse(ME), at: AT } });
    });
    expect(host?.textContent).toBe("");
  });
});
