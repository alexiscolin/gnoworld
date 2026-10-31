// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { all, button, click, mount, one } from "../../../tests/mount.tsx";
import { MessageBox } from "./MessageBox.tsx";

// 5q: the composer's one box (frame 23.58.01): a small format bar, the field, and at its foot two marks that work today
// (@ and /: the video's + and emoji wait for their features) and a round Send.
const draw = (over: Partial<Parameters<typeof MessageBox>[0]> = {}) =>
  mount(
    <MessageBox onFormat={() => undefined} onInsert={() => undefined} send="Send" goes {...over}>
      <textarea aria-label="Message #games" />
    </MessageBox>,
  );

describe("the composer's box", () => {
  it("is one group holding the format bar, the field and Send", () => {
    const box = draw();
    expect(one(box, '[role="group"][aria-label="Message box"]').querySelector("textarea")).not.toBeNull();
    expect(all(box, '[role="group"][aria-label="Format"] button')).toHaveLength(8);
    expect(button(box, "Send")?.getAttribute("type")).toBe("submit");
  });

  it("puts an @ or a / in the draft through its marks, and offers no button for what does not work yet", () => {
    const onInsert = vi.fn();
    const box = draw({ onInsert });
    click(button(box, "Mention someone"));
    click(button(box, "Start a command"));
    expect(onInsert.mock.calls).toEqual([["@"], ["/"]]);
    expect(button(box, "Add something")).toBeUndefined();
    expect(button(box, "Emoji")).toBeUndefined();
  });

  it("applies a format of the bar to the draft", () => {
    const onFormat = vi.fn();
    click(button(draw({ onFormat }), "Bold"));
    expect(onFormat).toHaveBeenCalledWith("bold");
  });

  it("names Send for what it does, a word for assistive technology, and is off while the line cannot go", () => {
    const sending = draw({ send: "Save", goes: false });
    expect(button(sending, "Save")?.hasAttribute("disabled")).toBe(true);
    expect(draw().querySelector("button[type='submit']")?.hasAttribute("disabled")).toBe(false);
  });
});
