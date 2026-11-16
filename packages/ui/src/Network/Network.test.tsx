import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Network } from "./Network.tsx";
import { wrapWords } from "./marks.tsx";

// A live pulse beats for a minute and rests; a new content beats it again, which a new element does (the animation starts with its element).
describe("the halo's pulse", () => {
  it("breathes the network's halo again for a new total", () => {
    const nodes = [{ id: "a", label: "a", kind: "realm" as const }];
    const side = (total: number) => ({ word: "imports", nodes, total });
    const graph = (left: number) => (
      <Network label="Linked" centre={{ id: "c", label: "c" }} left={side(left)} right={side(1)} />
    );
    const view = render(graph(1));
    const halo = view.container.querySelector("circle");
    view.rerender(graph(1));
    expect(view.container.querySelector("circle")).toBe(halo);
    view.rerender(graph(2));
    expect(view.container.querySelector("circle")).not.toBe(halo);
  });
});

// A dot that is a button names itself by its aria-label; a <title> with the same words inside it would be read twice as its text
// (axe's label-content-name-mismatch, seen on network--picked).
describe("a dot that answers a pick", () => {
  const graph = (onSelect?: () => void) => (
    <Network
      label="Linked"
      centre={{ id: "c", label: "c" }}
      left={{ word: "imports", nodes: [{ id: "a", label: "a", detail: "gno.land/r/a" }] }}
      right={{ word: "imported by", nodes: [] }}
      {...(onSelect === undefined ? {} : { onSelect })}
    />
  );

  it("is a button named by its label alone, with no title repeating it", () => {
    const view = render(graph(() => undefined));
    const dot = view.getByRole("button", { name: "gno.land/r/a" });
    expect(dot.querySelector("title")).toBeNull();
  });

  it("keeps its title, the hover's full path, when nothing answers a pick", () => {
    const view = render(graph());
    expect(view.container.querySelector("title")?.textContent).toBe("gno.land/r/a");
  });
});

// An empty side's words stay inside their lane: they break between words when the lane is narrower than they are.
describe("wrapWords", () => {
  it("keeps a line that fits, breaks between words when it does not, and never splits a word", () => {
    expect(wrapWords("imports nothing", 20)).toEqual(["imports nothing"]);
    expect(wrapWords("imports nothing", 10)).toEqual(["imports", "nothing"]);
    expect(wrapWords("no imported by yet", 12)).toEqual(["no imported", "by yet"]);
    expect(wrapWords("imports nothing", 3)).toEqual(["imports", "nothing"]);
  });
});
