import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { chipsOf, Reactions } from "./Reactions.tsx";

const draw = (chips: string, react?: () => boolean) =>
  renderToStaticMarkup(<Reactions to="a" chips={chips} react={react} />);

describe("Reactions", () => {
  it("draws what chipsOf wrote: each emoji, its count of any length, and whether it is mine", () => {
    const family = "👨‍👩‍👧";
    const html = draw(
      chipsOf([
        { emoji: "👍", count: 12, mine: true },
        { emoji: family, count: 3, mine: false },
        { emoji: "1️⃣", count: 100, mine: false },
      ]),
      () => true,
    );
    expect(html).toContain("👍, 12, including you");
    expect(html).toContain(`${family}, 3"`);
    expect(html).toContain('1️⃣, 100"');
    expect(html.match(/<button/g)).toHaveLength(3);
  });

  it("draws a guest's chips plain, a line with none no chip, and a line with a few of the 20 no word", () => {
    expect(draw(chipsOf([{ emoji: "😂", count: 7, mine: true }]))).toContain("😂 7");
    expect(draw("")).not.toContain("<button");
    expect(draw(chipsOf([{ emoji: "😂", count: 1, mine: false }]))).not.toContain("more");
  });
});
