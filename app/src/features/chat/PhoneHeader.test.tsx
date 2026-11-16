// @vitest-environment jsdom
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { all, button, click, mount as bare, one } from "../../../tests/mount.tsx";
import { FullProvider } from "./full.ts";
import { PhoneHeader } from "./PhoneHeader.tsx";

// A phone's chat header, one row: Rooms, the place's name, search, who is here and Info, all at the control's 44 px. It has no Back: a phone
// has no home to go back to (the browser's own back still works).
const none = () => undefined;
const draw = (over: Partial<Parameters<typeof PhoneHeader>[0]> = {}) =>
  bare(
    <MemoryRouter>
      <FullProvider value>
        <PhoneHeader
          title="#games"
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
  it("draws no Back: a phone has no home for it to go to", () => {
    expect(button(draw(), "Back")).toBeUndefined();
  });

  it("says the name as the page's one heading, and the mark after it", () => {
    const box = draw({ mark: <span>Not encrypted</span> });
    expect(one(box, "h1").textContent).toBe("#games");
    expect(one(box, "[data-mark]").textContent).toBe("Not encrypted");
  });

  it("draws Rooms first, then the place's acts and Info, on one row, each a named button at the control's size", () => {
    const labels = all(draw(), "button").map((each) => each.getAttribute("aria-label") ?? each.textContent);
    expect(labels).toEqual(["Rooms", "Search messages", "Who's here", "Info"]);
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

  it("cuts a long name to one line with an ellipsis (ChatHeader's own name, never a copy)", () => {
    const heading = one(draw({ title: "#a-room-with-a-very-long-name-indeed" }), "h1");
    expect(heading.classList.contains("truncate")).toBe(true);
    expect(heading.getAttribute("title")).toBe("#a-room-with-a-very-long-name-indeed");
  });

  it("keeps the room name's menu (the rooms and the notification modes): the name opens it", () => {
    const box = draw({ menu: { label: "Rooms", content: <p>Notify me of every message</p> } });
    expect(document.querySelector("dialog[open]")).toBeNull();
    click(button(box, "#games"));
    expect(document.querySelector("dialog[open]")?.textContent).toContain("Notify me of every message");
  });

  it("draws a plain name where there is no menu", () => {
    expect(button(draw(), "#games")).toBeUndefined();
  });
});
