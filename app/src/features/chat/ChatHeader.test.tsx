// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { all, button, click, mount, one } from "../../../tests/mount.tsx";
import { ChatHeader } from "./ChatHeader.tsx";

// 5q: the full-screen chat's header (frame 23.58.01, top): the kicker, the room's name, the expand and close controls.
describe("the chat's header", () => {
  it("says the kicker above the room's name, the name a heading of level 2", () => {
    const box = mount(<ChatHeader kicker="Earth · General chat" title="#general" />);
    expect(one(box, "p").textContent).toBe("Earth · General chat");
    expect(one(box, "h2").textContent).toBe("#general");
    expect(one(box, "p").compareDocumentPosition(one(box, "h2")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("offers Expand when it is not full screen and Shrink when it is, one button whose name says what it does", () => {
    const onExpand = vi.fn();
    const first = mount(<ChatHeader kicker="k" title="t" expanded={false} onExpand={onExpand} />);
    click(button(first, "Expand the chat"));
    expect(onExpand).toHaveBeenCalledTimes(1);
    click(button(mount(<ChatHeader kicker="k" title="t" expanded onExpand={onExpand} />), "Shrink the chat"));
    expect(onExpand).toHaveBeenCalledTimes(2);
    expect(button(first, "Shrink the chat")).toBeUndefined();
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
});
