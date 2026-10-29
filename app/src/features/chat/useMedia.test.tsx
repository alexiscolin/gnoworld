// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMedia } from "./useMedia.ts";

// F2302: the hook the drawer's layout and the composer's Enter both read the screen through.
function Probe() {
  return <p>{String(useMedia("(max-width: 900px)"))}</p>;
}

describe("useMedia", () => {
  let root: Root | undefined;
  let host: HTMLElement;
  let matches: boolean;
  const listeners = new Set<() => void>();
  const add = vi.fn((_type: string, listener: () => void) => listeners.add(listener));
  const remove = vi.fn((_type: string, listener: () => void) => listeners.delete(listener));
  const ask = vi.fn((query: string) => ({
    query,
    get matches() {
      return matches;
    },
    addEventListener: add,
    removeEventListener: remove,
  }));
  const shown = () => host.textContent;
  const mount = () => {
    root = createRoot(host);
    act(() => {
      root?.render(<Probe />);
    });
  };

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("matchMedia", ask);
    host = document.body.appendChild(document.createElement("div"));
    matches = true;
  });
  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    host.remove();
    listeners.clear();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("answers true when the query matches, asking for the query it was given", () => {
    mount();
    expect(shown()).toBe("true");
    expect(ask).toHaveBeenCalledWith("(max-width: 900px)");
  });

  it("answers false when it does not", () => {
    matches = false;
    mount();
    expect(shown()).toBe("false");
  });

  it("reads the screen again as it says a change", () => {
    mount();
    matches = false;
    act(() => {
      listeners.forEach((listener) => {
        listener();
      });
    });
    expect(shown()).toBe("false");
    expect(add).toHaveBeenCalledWith("change", expect.any(Function));
  });

  it("stops listening as it unmounts, taking off the listener it put on", () => {
    mount();
    const put = add.mock.calls[0]?.[1];
    act(() => {
      root?.unmount();
    });
    root = undefined;
    expect(remove).toHaveBeenCalledWith("change", put);
    expect(listeners.size).toBe(0);
  });

  it("says no on the server, where there is no screen", () => {
    expect(renderToString(<Probe />)).toContain("false");
  });
});
