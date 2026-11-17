// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FullLoading } from "./FullLoading.tsx";

describe("the full chat's skeleton", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  // A visitor whose rooms could not load sees the failure alone, with no chat screen: the skeleton must give way to it.
  it("goes once the rooms' failure is drawn, as it does for a chat screen", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
      },
    );
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    vi.useFakeTimers();
    const host = document.createElement("div");
    document.body.append(host);
    const gone = vi.fn();
    const root = createRoot(host);
    act(() => {
      root.render(<FullLoading onGone={gone} />);
    });
    const failure = document.createElement("div");
    failure.setAttribute("data-chat-failed", "");
    await act(async () => {
      document.body.append(failure);
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(gone).toHaveBeenCalled();
    act(() => {
      root.unmount();
    });
    vi.unstubAllGlobals();
  });
});
