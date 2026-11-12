import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BubbleWords } from "./BubbleWords.tsx";

const words = (text: string) => renderToStaticMarkup(<BubbleWords text={text} max={80} />);

describe("a bubble's words", () => {
  it("reads a line as it reads, never its marks", () => {
    expect(words("**gros**")).toBe("gros");
    expect(words("see [the docs](https://gno.land) now")).toBe("see the docs now");
    expect(words("run `gno test`")).toBe("run gno test");
  });

  it("cuts the words it reads, never a mark: a long bold line ends with an ellipsis and no star", () => {
    const out = words(`**${"gros ".repeat(40)}fin** end`);
    expect(out).not.toContain("*");
    expect(out.endsWith("…")).toBe(true);
    expect(Array.from(out)).toHaveLength(80);
  });
});
