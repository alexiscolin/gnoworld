import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { eachStory } from "../testing.tsx";
import { Icon, ICON_NAMES, type IconName } from "./Icon.tsx";
import * as stories from "./Icon.stories.tsx";

// docs/DESIGN-SYSTEM.md, "Icons": the one set, and the six that point along the text.
const LISTED = [
  ...["close", "plus", "arrow", "arrow-up-right", "chevron", "search", "chat", "thread", "reply", "bell"],
  ...["passport", "seal", "expand", "shrink", "image", "bookmark", "smile", "code", "code-block", "list-bulleted"],
  ...["list-numbered", "quote", "pause", "play", "pin", "more", "pencil", "link", "comet", "at"],
  ...["mail", "check", "calendar", "spark", "news", "satellite", "planet", "cluster", "bold", "italic"],
  ...["underline", "strikethrough", "slash", "caret", "share", "menu", "people", "star", "chart", "info"],
  ...["warning", "alert", "lock", "shield", "key", "sliders"],
] as const satisfies readonly IconName[];
const DIRECTIONAL = new Set<IconName>(["arrow", "arrow-up-right", "reply", "list-bulleted", "list-numbered", "quote"]);

function svgOf(name: IconName, size?: "m" | "l") {
  const { container } = render(size === undefined ? <Icon name={name} /> : <Icon name={name} size={size} />);
  const svg = container.querySelector("svg");
  if (svg === null) throw new Error(`${name} drew no svg`);
  return svg;
}

describe("Icon", () => {
  it("draws exactly the 56 icons the design system lists", () => {
    expect(new Set(LISTED).size).toBe(56);
    expect([...ICON_NAMES].sort()).toEqual([...LISTED].sort());
  });

  it.each(LISTED)("draws %s on the 16 px grid, named, and hidden from assistive technology", (name) => {
    const svg = svgOf(name);
    expect(svg.getAttribute("viewBox")).toBe("0 0 16 16");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.dataset["icon"]).toBe(name);
    expect(svg.querySelectorAll("path, circle, rect").length).toBeGreaterThan(0);
  });

  it("draws 56 different drawings", () => {
    const drawing = (svg: SVGSVGElement) =>
      [...svg.querySelectorAll("*")].map((shape) =>
        [shape.tagName, ...[...shape.attributes].map((a) => `${a.name}=${a.value}`)].join(" "),
      );
    const drawings = LISTED.map((name) => drawing(svgOf(name)).join("; "));
    expect(new Set(drawings).size).toBe(56);
  });

  it.each(LISTED)("paints %s only in the text's colour", (name) => {
    for (const element of [svgOf(name), ...svgOf(name).querySelectorAll("*")]) {
      for (const paint of ["fill", "stroke"]) {
        expect(["none", "currentColor", null]).toContain(element.getAttribute(paint));
      }
      expect(element.getAttribute("style")).toBeNull();
    }
  });

  it("is 16 px unless asked for 20", () => {
    expect(svgOf("search").dataset["size"]).toBe("m");
    expect(svgOf("search", "l").dataset["size"]).toBe("l");
  });

  it.each(LISTED)("marks %s to mirror right to left only if it points along the text", (name) => {
    expect(svgOf(name).hasAttribute("data-mirror")).toBe(DIRECTIONAL.has(name));
  });

  it("has a gallery story that shows all 56", () => {
    const counts = eachStory(stories, (container) => container.querySelectorAll("svg").length);
    expect(Math.max(...counts)).toBe(56);
  });
});
