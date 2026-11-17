// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, click, drawer, settled } from "../tests/mount.tsx";
import { CodeBlock } from "./CodeBlock.tsx";

beforeEach(() => {
  // jsdom has no reportError, where a copy's failure to report would go.
  vi.stubGlobal("reportError", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CodeBlock", () => {
  it("says what a copy came to on its button and to a screen reader, for the text it copied alone", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const draw = drawer();
    draw(<CodeBlock text="first" />);
    click(button(document.body, "Copy"));
    await settled(() => button(document.body, "Copied") !== undefined);
    expect(writeText).toHaveBeenCalledWith("first");
    expect(document.body.querySelector("[role=status]")?.textContent).toBe("Copied");
    draw(<CodeBlock text="second" />);
    expect(button(document.body, "Copy")).toBeDefined();
    expect(document.body.querySelector("[role=status]")?.textContent).toBe("");
  });

  it("says a refused copy", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: () => Promise.reject(new Error("denied")) } });
    drawer()(<CodeBlock text="first" />);
    click(button(document.body, "Copy"));
    await settled(() => button(document.body, "Not copied") !== undefined);
    expect(document.body.querySelector("[role=status]")?.textContent).toBe("Could not copy the block");
  });
});
