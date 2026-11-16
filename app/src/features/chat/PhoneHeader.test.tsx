// @vitest-environment jsdom
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { all, button, click, mount as bare, one } from "../../../tests/mount.tsx";
import { FullProvider } from "./full.ts";
import { PhoneHeader } from "./PhoneHeader.tsx";

// A phone's chat header: back first, the place's name, then Rooms, who is here, search and Info, all at the control's 44 px.
const none = () => undefined;
const draw = (over: Partial<Parameters<typeof PhoneHeader>[0]> = {}) =>
  bare(
    <MemoryRouter>
      <FullProvider value>
        <PhoneHeader
          title="#games"
          onBack={none}
          onInfo={none}
          rooms={<button type="button">Rooms</button>}
          acts={[
            { label: "Search messages", icon: "search", onSelect: none },
            { label: "Who's here", icon: "people", onSelect: none },
          ]}
          {...over}
        />
      </FullProvider>
    </MemoryRouter>,
  );

describe("a phone's chat header", () => {
  it("goes back through its first control, named Back", () => {
    const onBack = vi.fn();
    const box = draw({ onBack });
    expect(all(box, "button")[0]?.getAttribute("aria-label")).toBe("Back");
    click(button(box, "Back"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("says the name as the page's one heading, and the mark after it", () => {
    const box = draw({ mark: <span>Not encrypted</span> });
    expect(one(box, "h1").textContent).toBe("#games");
    expect(one(box, "[data-mark]").textContent).toBe("Not encrypted");
  });

  it("draws Rooms, the place's acts and Info, in reach order, each a named button at the control's size", () => {
    const labels = all(draw(), "button").map((each) => each.getAttribute("aria-label") ?? each.textContent);
    expect(labels).toEqual(["Back", "Info", "Rooms", "Search messages", "Who's here"]);
    for (const control of all(draw(), "button[data-size]")) expect(control.getAttribute("data-size")).toBe("m");
  });

  it("asks for Info through its control", () => {
    const onInfo = vi.fn();
    click(button(draw({ onInfo }), "Info"));
    expect(onInfo).toHaveBeenCalledTimes(1);
  });

  it("draws the acts that do something and none that is only to come", () => {
    const box = draw({ acts: [{ label: "Events", icon: "calendar" }] });
    expect(button(box, "Events")).toBeUndefined();
  });
});
