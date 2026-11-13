// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { standing } from "./viewsIndicator.ts";

describe("where the views' fill stands", () => {
  const nav = (): HTMLElement => {
    const bar = document.createElement("nav");
    bar.style.setProperty("--_fill-x", "12px");
    bar.style.setProperty("--_fill-w", "40px");
    return bar;
  };

  it("is read from the pill's own properties", () => {
    expect(standing(nav())).toEqual({ x: 12, width: 40 });
  });

  it("is none while no level is in view, so the next level's fill comes back in its place", () => {
    const bar = nav();
    bar.dataset["empty"] = "";
    expect(standing(bar)).toBeUndefined();
  });
});
