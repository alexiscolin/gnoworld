// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountUniverse } from "./mountUniverse.tsx";

vi.mock("./Universe.tsx", () => ({
  Universe: ({ shown }: { shown: boolean }) => <canvas data-shown={String(shown)} />,
}));

afterEach(() => {
  document.body.replaceChildren();
});

describe("mountUniverse", () => {
  it("puts the universe under the page's root, and tells it what the page shows", () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
    const page = document.createElement("div");
    document.body.append(page);
    const show = mountUniverse();
    act(() => {
      show(true);
    });
    const canvas = document.body.querySelector("canvas");
    expect(canvas?.getAttribute("data-shown")).toBe("true");
    expect(page.contains(canvas)).toBe(false);
    act(() => {
      show(false);
    });
    expect(document.body.querySelector("canvas")).toBe(canvas);
    expect(canvas?.getAttribute("data-shown")).toBe("false");
  });
});
