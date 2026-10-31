// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { all, button, click, mount, one } from "../../../tests/mount.tsx";
import { ChatHeader } from "./ChatHeader.tsx";

// 5q: the full-screen chat's header (frame 23.58.01, top): the kicker, the room's name, the close control.
describe("the chat's header", () => {
  it("says the kicker above the room's name, the name a heading of level 2", () => {
    const box = mount(<ChatHeader kicker="Earth · General chat" title="#general" />);
    expect(one(box, "p").textContent).toBe("Earth · General chat");
    expect(one(box, "h2").textContent).toBe("#general");
    expect(one(box, "p").compareDocumentPosition(one(box, "h2")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("closes through its Close button, named, a button and not a bare icon", () => {
    const onClose = vi.fn();
    click(button(mount(<ChatHeader kicker="k" title="t" onClose={onClose} />), "Close the chat"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("draws no control for what it is not given an action for: no dead button", () => {
    expect(all(mount(<ChatHeader kicker="k" title="t" />), "button")).toHaveLength(0);
  });

  it("puts the control to the rooms before the kicker, where a phone's header has it", () => {
    const box = mount(<ChatHeader kicker="k" title="t" rooms={<button type="button">Rooms</button>} />);
    expect(box.firstElementChild?.firstElementChild?.textContent).toBe("Rooms");
  });

  it("makes the name the menu's trigger, a chevron after it, the name still the level-2 heading", () => {
    const box = mount(<ChatHeader kicker="k" title="#general" menu={{ label: "Room", content: <p>About</p> }} />);
    expect(all(box, "h2")[0]?.textContent).toBe("#general");
    const trigger = button(box, "#general");
    expect(trigger?.getAttribute("aria-haspopup")).toBe("dialog");
    expect(trigger?.querySelector("svg[data-icon='chevron']")).not.toBeNull();
    expect(one(box, "dialog").textContent).toContain("About");
  });

  it("keeps a plain name when it has no menu: no dead control", () => {
    expect(button(mount(<ChatHeader kicker="k" title="#general" />), "#general")).toBeUndefined();
  });

  it("says a mark after the name, in view without opening anything", () => {
    expect(mount(<ChatHeader kicker="k" title="@mia" mark={<span>Not encrypted</span>} />).textContent).toContain(
      "Not encrypted",
    );
  });
});
