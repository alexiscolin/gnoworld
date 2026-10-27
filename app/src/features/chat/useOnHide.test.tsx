// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useOnHide } from "./useOnHide.ts";

// The page hiding (slice 4's 4f, F940): its callback runs each time the page goes hidden, and no longer once the
// component is gone.
function Probe({ onHide }: { onHide: () => void }) {
  useOnHide(onHide);
  return null;
}
const visibility = (state: "hidden" | "visible") => {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
};
afterEach(() => {
  Reflect.deleteProperty(document, "visibilityState");
});

describe("useOnHide", () => {
  it("calls back each time the page hides, never as it shows", () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const hidden = vi.fn();
    const root = createRoot(document.createElement("div"));
    act(() => {
      root.render(<Probe onHide={hidden} />);
    });
    visibility("visible");
    expect(hidden).not.toHaveBeenCalled();
    visibility("hidden");
    visibility("hidden");
    expect(hidden).toHaveBeenCalledTimes(2);
    act(() => {
      root.unmount();
    });
    visibility("hidden");
    expect(hidden).toHaveBeenCalledTimes(2);
  });

  it("calls the callback the component has now, not the first one", () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const first = vi.fn();
    const second = vi.fn();
    const root = createRoot(document.createElement("div"));
    act(() => {
      root.render(<Probe onHide={first} />);
    });
    act(() => {
      root.render(<Probe onHide={second} />);
    });
    visibility("hidden");
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    act(() => {
      root.unmount();
    });
  });
});
