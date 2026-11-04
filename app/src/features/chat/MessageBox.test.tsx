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
    expect(all(box, '[role="group"][aria-label="Format"] button')).toHaveLength(9);
    expect(button(box, "Send")?.getAttribute("type")).toBe("submit");
  });

  // 5q2 (frame f0066): the bar's tools in groups, a rule between them (prototype #fmtBar .sep): marks, then code, then lists.
  it("sets a rule between the format bar's groups: after the marks, after the code and the quote", () => {
    const bar = one(draw(), '[role="group"][aria-label="Format"]');
    const order = [...bar.querySelectorAll("button, [role='separator']")].map((each) =>
      each.getAttribute("role") === "separator" ? "|" : each.getAttribute("aria-label"),
    );
    expect(order).toEqual([
      "Bold",
      "Italic",
      "Underline",
      "Strikethrough",
      "|",
      "Code",
      "Link",
      "Quote",
      "|",
      "Bulleted list",
      "Numbered list",
    ]);
    expect(bar.querySelectorAll("[role='separator'][aria-orientation='vertical']")).toHaveLength(2);
  });

  it("puts an @ or a / in the draft through its marks, and offers no button for what does not work yet", () => {
    const onInsert = vi.fn();
    const box = draw({ onInsert });
    click(button(box, "Mention someone"));
    click(button(box, "Start a command"));
    expect(onInsert.mock.calls).toEqual([["@"], ["/"]]);
    // The foot holds these two and Send, nothing else: the buttons outside the format bar, by their names.
    const foot = all(box, "button")
      .filter((each) => each.closest('[aria-label="Format"]') === null)
      .map((each) => each.getAttribute("aria-label") ?? each.textContent);
    expect(foot).toEqual(["Mention someone", "Start a command", "Send"]);
  });

  it("applies a format of the bar to the draft", () => {
    const onFormat = vi.fn();
    click(button(draw({ onFormat }), "Bold"));
    expect(onFormat).toHaveBeenCalledWith("bold");
  });

  // 8k (frame 73: B, I, U, S): the underline between italic and strikethrough, its icon the design system's, a plain
  // button as its siblings are (none of them holds a pressed state or a shortcut).
  it("draws Underline between Italic and Strikethrough, with the design system's underline icon, and applies it", () => {
    const onFormat = vi.fn();
    const box = draw({ onFormat });
    const underline = button(box, "Underline");
    expect(underline?.getAttribute("type")).toBe("button");
    expect(underline?.hasAttribute("aria-pressed")).toBe(false);
    expect(underline?.hasAttribute("aria-keyshortcuts")).toBe(false);
    expect(underline?.querySelector("svg")?.getAttribute("data-icon")).toBe("underline");
    click(underline);
    expect(onFormat).toHaveBeenCalledWith("underline");
  });

  it("names Send for what it does, a word for assistive technology, and is off while the line cannot go", () => {
    const sending = draw({ send: "Save", goes: false });
    expect(button(sending, "Save")?.hasAttribute("disabled")).toBe(true);
    expect(draw().querySelector("button[type='submit']")?.hasAttribute("disabled")).toBe(false);
  });
});
