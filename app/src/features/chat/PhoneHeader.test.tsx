// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { all, button, click, mount as bare, one } from "../../../tests/mount.tsx";
import { PhoneHeader } from "./PhoneHeader.tsx";

// The phone's rooms row, under the place in the band: the rooms' control, the rooms as chips and the chat's search, on one row of 44 px
// targets. No Back, no people, no Info: the place's button above is Info, and Info holds the people.
const none = () => undefined;
const draw = (over: Partial<Parameters<typeof PhoneHeader>[0]> = {}) =>
  bare(
    <PhoneHeader
      rooms={<button type="button">Rooms</button>}
      chips={<nav aria-label="Room shortcuts">chips</nav>}
      search={{ label: "Search messages", icon: "search-messages", onSelect: none }}
      {...over}
    />,
  );

describe("a phone's rooms row", () => {
  it("draws the rooms' control first, the chips, then the chat's search, nothing else", () => {
    const box = draw();
    expect(all(box, "button").map((each) => each.getAttribute("aria-label") ?? each.textContent)).toEqual([
      "Rooms",
      "Search messages",
    ]);
    expect(one(box, "nav").textContent).toBe("chips");
  });

  it("draws no Back, no people and no Info", () => {
    const box = draw();
    for (const name of ["Back", "Info", "Who's here"]) expect(button(box, name)).toBeUndefined();
  });

  it("asks for the search through its control, a 44 px target (the 32 px control with its box)", () => {
    const onSelect = vi.fn();
    const box = draw({ search: { label: "Search messages", icon: "search-messages", onSelect } });
    const search = button(box, "Search messages");
    expect(search?.getAttribute("data-size")).toBe("s");
    expect(search?.classList.contains("hit")).toBe(true);
    click(search);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("draws no search where the search does nothing", () => {
    expect(
      button(draw({ search: { label: "Search messages", icon: "search-messages" } }), "Search messages"),
    ).toBeUndefined();
  });
});
