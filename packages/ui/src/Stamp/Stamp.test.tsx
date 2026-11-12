import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { eachStoryHas, staysText } from "../testing.tsx";
import { outline, stampLook } from "./look.ts";
import { Stamp } from "./Stamp.tsx";
import * as stories from "./Stamp.stories.tsx";

const seeds = [
  "games/chess",
  "gnoland/wugnot",
  "nym-ana/hello",
  "g1abc/tally",
  "demo/defi",
  "gov/boards",
  "x/daily/streak",
];

describe("the stamp's look", () => {
  it("is a function of its seed: the same seed draws the same mark", () => {
    expect(stampLook("games/chess")).toEqual(stampLook("games/chess"));
    expect(outline(stampLook("games/chess"), 1)).toBe(outline(stampLook("games/chess"), 1));
  });

  it("changes in more than its ink from one seed to another", () => {
    const [first, ...others] = seeds.map(stampLook);
    for (const other of others) {
      if (first === undefined) throw new Error("no look");
      const changed = (["roundness", "rx", "tilt", "dash"] as const).filter((key) => other[key] !== first[key]);
      expect(changed.length).toBeGreaterThan(1);
    }
  });

  it("takes its values from continuous ranges, not a small set", () => {
    const manySeeds = Array.from({ length: 60 }, (_, at) => `world/${String(at)}`);
    for (const key of ["roundness", "tilt", "hue"] as const)
      expect(new Set(manySeeds.map((seed) => stampLook(seed)[key])).size).toBeGreaterThan(40);
  });
});

describe("Stamp", () => {
  it("says its world, its system and its day, and wears the gold of a world charted first", () => {
    const { container, rerender } = render(<Stamp seed="a/hello" name="hello" day="4 Nov" system="a" />);
    const mark = container.querySelector("svg");
    expect(mark?.getAttribute("aria-label")).toBe("hello, a, stamped 4 Nov");
    expect(mark?.hasAttribute("data-gold")).toBe(false);
    rerender(<Stamp seed="a/hello" name="hello" day="4 Nov" system="a" gold />);
    expect(container.querySelector("svg")?.getAttribute("aria-label")).toContain("charted first");
    expect(container.querySelector("svg")?.hasAttribute("data-gold")).toBe(true);
  });

  it("draws two worlds of one name apart, each naming its system", () => {
    const { container } = render(
      <>
        <Stamp seed="nym-a/hello" name="hello" day="4 Nov" system="nym-a" />
        <Stamp seed="g1b/hello" name="hello" day="4 Nov" system="g1b" />
      </>,
    );
    const [first, second] = [...container.querySelectorAll("svg")];
    expect(first?.querySelector("path")?.getAttribute("d")).not.toBe(second?.querySelector("path")?.getAttribute("d"));
    expect(first?.textContent).toContain("NYM-A");
    expect(second?.textContent).toContain("G1B");
  });

  it("has stories, each a mark", () => {
    expect(eachStoryHas(stories, "svg[role='img']")).toBe(true);
  });

  it("shows a name made of markup, or very long, as text", () => {
    staysText((text) => <Stamp seed="a/b" name={text} day="4 Nov" system="a" />);
  });
});
