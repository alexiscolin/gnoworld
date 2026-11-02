// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

// 7d6: the hero counts what the cosmos draws. The scene's chunk reads the file and says it here, where the first screen's hero reads it.
async function counter() {
  vi.resetModules();
  const count = await import("./worldsCount.ts");
  const seen: (number | undefined)[] = [];
  function Hero() {
    seen.push(count.useWorldsDrawn());
    return null;
  }
  const open = () => {
    const root = createRoot(document.createElement("div"));
    act(() => {
      root.render(<Hero />);
    });
    return () => {
      act(() => {
        root.unmount();
      });
    };
  };
  return { ...count, open, seen };
}

describe("the worlds the cosmos draws", () => {
  it("knows no count until the scene says one, then gives it to every page that asks", async () => {
    const { open, seen, worldsDrawn } = await counter();
    const leave = open();
    expect(seen.at(-1)).toBeUndefined();
    act(() => {
      worldsDrawn(534);
    });
    expect(seen.at(-1)).toBe(534);
    leave();
    const again = open();
    expect(seen.at(-1)).toBe(534);
    again();
  });

  it("stops telling a page that left", async () => {
    const { open, seen, worldsDrawn } = await counter();
    open()();
    const heard = seen.length;
    act(() => {
      worldsDrawn(12);
    });
    expect(seen).toHaveLength(heard);
  });
});
