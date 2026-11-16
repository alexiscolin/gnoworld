// @vitest-environment jsdom
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { mount, one, settled } from "../../../tests/mount.tsx";
import { GuestWriter } from "./GuestWriter.tsx";

describe("a guest's composer", () => {
  // The workshop (2026-11-16): a bare textarea took the browser's resize grip. The design system's Field draws the box, and its fixed
  // one (data-fixed) is the one Field.module.css gives `resize: none`; jsdom applies no stylesheet, so the mark is what is read.
  it("is the design system's fixed box of lines, named and worded for the room, with no grip to drag", () => {
    const box = one(mount(<GuestWriter room="#games" />), "form textarea");
    expect(box.getAttribute("data-fixed")).toBe("");
    expect(box.getAttribute("placeholder")).toBe("Message #games");
    expect(box.parentElement?.querySelector(`label[for="${box.id}"]`)?.textContent).toBe("Message #games");
  });

  // As the old textarea's: set while a refusal's line is shown, gone once the reader edits the line.
  it("marks its box invalid while a refusal is shown, and not once the line is edited", async () => {
    vi.stubGlobal("reportError", vi.fn());
    vi.stubGlobal("fetch", (url: string) =>
      Promise.resolve(
        url.endsWith("/say")
          ? Response.json({ error: "not_ready", cause: "unchecked" }, { status: 503 })
          : Response.json({ name: "brave-otter-abcd" }),
      ),
    );
    const view = mount(<GuestWriter room="#games" />);
    const box = one(view, "form textarea");
    const type = (text: string) => {
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(box, text);
        box.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };
    expect(box.getAttribute("aria-invalid")).toBeNull();
    type("hello");
    act(() => {
      one(view, "form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await settled(() => view.querySelector("[role='alert']") !== null);
    expect(box.getAttribute("aria-invalid")).toBe("true");
    expect(box.getAttribute("aria-describedby")).toBe(view.querySelector("[role='alert']")?.id);
    type("hello again");
    expect(box.getAttribute("aria-invalid")).toBeNull();
    vi.unstubAllGlobals();
  });
});
