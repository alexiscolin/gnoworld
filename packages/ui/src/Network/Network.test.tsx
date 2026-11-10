import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Network } from "./Network.tsx";

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
