// @vitest-environment jsdom
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { all, button, click, mount as bare, one } from "../../../tests/mount.tsx";
import { ChatHeader } from "./ChatHeader.tsx";
import { FullProvider } from "./full.ts";

// 5q: the full-screen chat's header (frame 23.58.01, top): the room's name, the close control.
const none = () => undefined;
// The header reads the address (its name's menu, its full-chat button).
const mount = (element: ReactElement) => bare(<MemoryRouter>{element}</MemoryRouter>);

describe("the chat's header", () => {
  it("says the room's name, a heading of level 2", () => {
    const box = mount(<ChatHeader title="#general" onClose={none} />);
    expect(one(box, "h2").textContent).toBe("#general");
  });

  it("closes through its Close button, named, a button and not a bare icon", () => {
    const onClose = vi.fn();
    click(button(mount(<ChatHeader title="t" onClose={onClose} />), "Close the chat"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // D441, D445 (Alexis, 2026-11-07): a chat with a dock is never closed, it opens full from the dock's arrows; one with none is closed.
  it("draws Close alone for a chat with no dock, and the full chat's button alone for one with a dock", () => {
    const labels = (box: HTMLElement) => all(box, "button").map((each) => each.getAttribute("aria-label"));
    expect(labels(mount(<ChatHeader title="t" onClose={none} />))).toEqual(["Close the chat"]);
    expect(labels(mount(<ChatHeader title="t" onClose={none} docked />))).toEqual(["Open the full chat"]);
  });

  it("draws no control of its own in the full chat of a dock: that chat closes from its own bar", () => {
    const box = mount(
      <FullProvider value>
        <ChatHeader title="t" onClose={none} docked />
      </FullProvider>,
    );
    expect(all(box, "button")).toEqual([]);
  });

  it("says the place before the room in the wide full chat, once when the room is named as its place", () => {
    const wide = (title: string) =>
      mount(
        <FullProvider value>
          <ChatHeader title={title} onClose={none} world="Bubble" />
        </FullProvider>,
      );
    expect(one(wide("#general"), "h2").textContent).toBe("#general");
    expect(wide("#general").textContent).toContain("Bubble/#general");
    expect(wide("#bubble").textContent).not.toContain("Bubble/");
  });

  it("puts the control to the rooms before the kicker, where a phone's header has it", () => {
    const box = mount(<ChatHeader title="t" onClose={none} rooms={<button type="button">Rooms</button>} />);
    // The control and the place share the header's first box, its first row on a narrow chat (7e changed this test: one level deeper).
    expect(box.firstElementChild?.firstElementChild?.firstElementChild?.textContent).toBe("Rooms");
  });

  it("makes the name the menu's trigger, a chevron after it, the name still the level-2 heading", () => {
    const box = mount(<ChatHeader title="#general" onClose={none} menu={{ label: "Room", content: <p>About</p> }} />);
    expect(all(box, "h2")[0]?.textContent).toBe("#general");
    const trigger = button(box, "#general");
    expect(trigger?.getAttribute("aria-haspopup")).toBe("dialog");
    expect(trigger?.querySelector("svg[data-icon='chevron']")).not.toBeNull();
    expect(one(box, "dialog").textContent).toContain("About");
  });

  it("keeps a plain name when it has no menu: no dead control", () => {
    expect(button(mount(<ChatHeader title="#general" onClose={none} />), "#general")).toBeUndefined();
  });

  it("says a mark after the name, in view without opening anything", () => {
    expect(mount(<ChatHeader title="@mia" onClose={none} mark={<span>Not encrypted</span>} />).textContent).toContain(
      "Not encrypted",
    );
  });
});
