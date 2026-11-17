// @vitest-environment jsdom
import { PHONE_QUERY } from "@gnoworld/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { all, button, click, mount, noMedia, one } from "../../../../tests/mount.tsx";
import { MessageBox } from "./MessageBox.tsx";

// The composer's one box (frame 23.58.01): a small format bar, the field, and at its foot a round Send alone (the @ and /
// are typed, not drawn).
const draw = (over: Partial<Parameters<typeof MessageBox>[0]> = {}) =>
  mount(
    <MessageBox
      onFormat={() => undefined}
      linkTool={() => <button type="button" aria-label="Link" />}
      send="Send"
      goes
      {...over}
    >
      <textarea aria-label="Message #games" />
    </MessageBox>,
  );

beforeEach(noMedia);
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the composer's box", () => {
  it("is one group holding the format bar, the field and Send", () => {
    const box = draw();
    expect(one(box, '[role="group"][aria-label="Message box"]').querySelector("textarea")).not.toBeNull();
    expect(all(box, '[role="group"][aria-label="Format"] button')).toHaveLength(9);
    expect(button(box, "Send")?.getAttribute("type")).toBe("submit");
  });

  // Frame f0066: the bar's tools in groups, a rule between them (prototype #fmtBar .sep): marks, then code, then lists.
  it("sets a rule between the format bar's groups: after the marks, after the code and the quote", () => {
    const bar = one(draw(), '[role="group"][aria-label="Format"]');
    const order = [...bar.querySelectorAll("button, [role='separator']")].map((each) =>
      each.getAttribute("role") === "separator" ? "|" : (each.getAttribute("aria-label") ?? each.textContent),
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

  // The link has no format to apply in place: its tool is the caller's, a popover that asks for the address.
  it("draws the link tool the caller gives, between Code and Quote", () => {
    const bar = one(
      draw({ linkTool: () => <button type="button">Link tool</button> }),
      '[role="group"][aria-label="Format"]',
    );
    const names = all(bar, "button").map((each) => each.getAttribute("aria-label") ?? each.textContent);
    expect(names.slice(4, 7)).toEqual(["Code", "Link tool", "Quote"]);
  });

  it("holds Send and the phone's format control at its foot: no @ nor / button", () => {
    // The buttons outside the format bar, by their names.
    const foot = all(draw(), "button")
      .filter((each) => each.closest('[aria-label="Format"]') === null)
      .map((each) => each.getAttribute("aria-label") ?? each.textContent);
    // Formatting is the phone's fold control, hidden by CSS where the bar always shows.
    expect(foot).toEqual(["Formatting", "Send"]);
  });

  it("applies a format of the bar to the draft", () => {
    const onFormat = vi.fn();
    click(button(draw({ onFormat }), "Bold"));
    expect(onFormat).toHaveBeenCalledWith("bold");
  });

  // Frame 73 (B, I, U, S): the underline between italic and strikethrough, its icon the design system's, a plain
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

  // A phone shows the bar through one control (the CSS hides it until then), which says whether it is open.
  it("opens the format bar from one control that says whether it is open", () => {
    const box = draw();
    const bar = one(box, '[role="group"][aria-label="Format"]');
    expect(bar.hasAttribute("data-open")).toBe(false);
    const fold = button(box, "Formatting");
    expect(fold?.getAttribute("aria-expanded")).toBe("false");
    click(fold);
    expect(bar.hasAttribute("data-open")).toBe(true);
    expect(button(box, "Formatting")?.getAttribute("aria-expanded")).toBe("true");
    click(button(box, "Formatting"));
    expect(bar.hasAttribute("data-open")).toBe(false);
  });

  it("draws no format control for a box with no bar", () => {
    expect(button(draw({ onFormat: undefined }), "Formatting")).toBeUndefined();
  });

  // A phone folds the shell header while the field has the focus: a press that blurs it moves Send before the click lands.
  it("keeps the field focused on a phone when a press lands on its own buttons, and not on the field", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: query === PHONE_QUERY,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      })),
    );
    const box = draw();
    const press = (target: Element | null | undefined, type: "pointerdown" | "mousedown") => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      target?.dispatchEvent(event);
      return event.defaultPrevented;
    };
    for (const type of ["pointerdown", "mousedown"] as const) {
      expect(press(button(box, "Send"), type)).toBe(true);
      expect(press(button(box, "Bold")?.querySelector("svg"), type)).toBe(true);
      expect(press(box.querySelector("textarea"), type)).toBe(false);
    }
  });

  it("leaves a computer's press to move the focus", () => {
    const event = new Event("mousedown", { bubbles: true, cancelable: true });
    button(draw(), "Send")?.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
