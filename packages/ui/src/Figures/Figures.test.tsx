import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Figures, type Figure } from "./Figures.tsx";

// One cell's value as each reader meets it: what the eye reads (the counted text, hidden from a screen reader), what a screen reader
// reads, what a pointer's hover shows, and whether it is dimmed. jsdom asks for no motion, so a count stands at its value at once.
function valueOf(figure: Figure) {
  const { container } = render(<Figures label="Figures" figures={[figure]} />);
  const cell = container.querySelector("[data-span='3']");
  if (cell === null) throw new Error("the band drew no cell");
  const text = (selector: string) => cell.querySelector(selector)?.textContent;
  return {
    seen: text("[aria-hidden='true']") ?? text("[data-dim]"),
    read: text(".visually-hidden"),
    hover: cell.querySelector("[title]")?.getAttribute("title") ?? null,
    dim: cell.querySelector("[data-dim]") !== null,
  };
}

describe("a figure in its cell", () => {
  it("writes a count longer than five grouped characters compactly, its exact value read and shown on hover", () => {
    expect(valueOf({ key: "calls", label: "Calls", value: 12_345, sub: "direct calls" })).toEqual({
      seen: "12.3K",
      read: "12,345",
      hover: "12,345",
      dim: false,
    });
  });

  it("keeps a count of five grouped characters whole, with no hover text", () => {
    expect(valueOf({ key: "calls", label: "Calls", value: 9_999, sub: "direct calls" })).toEqual({
      seen: "9,999",
      read: "9,999",
      hover: null,
      dim: false,
    });
  });

  it("reads and shows a number's exact text when it is given, as for a supply JavaScript cannot hold exactly", () => {
    const figure = {
      key: "supply",
      label: "Supply",
      value: 1_859_191_185,
      full: "1,859,191,185",
      sub: "minted less burned",
    };
    expect(valueOf(figure)).toEqual({ seen: "1.86B", read: "1,859,191,185", hover: "1,859,191,185", dim: false });
  });

  it("dims a word that stands in place of a count, and only a word", () => {
    expect(valueOf({ key: "last", label: "Last call", value: "Never", sub: "its time is not read" })).toMatchObject({
      seen: "Never",
      dim: true,
    });
  });
});
