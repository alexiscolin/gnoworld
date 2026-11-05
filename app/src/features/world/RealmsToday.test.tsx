// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "../../../tests/mount.tsx";
import { RealmsToday } from "./RealmsToday.tsx";

// Slice 9g: the Earth's count of realms deployed in the last 24 hours, by block time, with the block it stood at. With no count
// from the server it draws nothing: a zero made up would read as a quiet chain.
// jsdom has no matchMedia: every query answers no, so the figure's count-up stays still.
beforeEach(() => {
  vi.stubGlobal("matchMedia", (media: string) => ({ matches: false, media }));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the Earth's realms of the last 24 h", () => {
  it("draws nothing with no count", () => {
    expect(renderToStaticMarkup(<RealmsToday count={undefined} />)).toBe("");
  });

  it("says the count, the 24 h and the block", () => {
    const box = mount(<RealmsToday count={{ universe: "onyx", count: 17, height: 908297 }} />);
    expect(box.textContent).toContain("17");
    expect(box.textContent).toMatch(/realms/);
    expect(box.textContent).toMatch(/deployed/);
    expect(box.textContent).toContain("block 908297");
  });

  it("says one realm for one, and a true zero for none", () => {
    const one = mount(<RealmsToday count={{ universe: "onyx", count: 1, height: 5 }} />).textContent;
    expect(one).toMatch(/realm(?!s)/);
    expect(one).not.toMatch(/realms/);
    const none = mount(<RealmsToday count={{ universe: "onyx", count: 0, height: 5 }} />).textContent;
    expect(none).toMatch(/realms/);
    expect(none).toContain("0");
  });

  // The video's figure (frame 38): a Stat, the number and its unit large, the caption under it saying the 24 h and the block.
  it("is a figure with its unit and a caption of the 24 h and the block, as the world's facts are", () => {
    const box = mount(<RealmsToday count={{ universe: "onyx", count: 37, height: 908297 }} />);
    expect(box.querySelector("[data-value]")?.getAttribute("data-value")).toBe("37");
    expect(box.querySelector("p")?.textContent).toContain("realms");
    expect([...box.querySelectorAll(".label")].map((node) => node.textContent)).toEqual([
      "deployed in 24 h · block 908297",
    ]);
    const one = mount(<RealmsToday count={{ universe: "onyx", count: 1, height: 5 }} />);
    expect(one.querySelector("p")?.textContent).toMatch(/1 realm$/);
  });
});
