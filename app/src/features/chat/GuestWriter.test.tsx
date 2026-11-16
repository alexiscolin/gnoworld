// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, noMedia, one, settled } from "../../../tests/mount.tsx";
import { GuestWriter } from "./GuestWriter.tsx";

beforeEach(noMedia);
afterEach(() => {
  vi.unstubAllGlobals();
});

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
    // Enter sends the guest's line (D432), through Field's own key: a key that added a line instead would fail here.
    act(() => {
      box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    await settled(() => view.querySelector("[role='alert']") !== null);
    expect(box.getAttribute("aria-invalid")).toBe("true");
    expect(box.getAttribute("aria-describedby")).toBe(view.querySelector("[role='alert']")?.id);
    type("hello again");
    expect(box.getAttribute("aria-invalid")).toBeNull();
    vi.unstubAllGlobals();
  });

  // D13720: Adena does not exist on a phone's browser, so a guest there is told how to log in, not offered a button that cannot work.
  describe("on a phone", () => {
    const phone = () => {
      vi.stubGlobal("matchMedia", (query: string) => ({
        matches: query === "(max-width: 899px)",
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }));
    };
    const connect = (room: HTMLElement) =>
      [...room.querySelectorAll("button")].find((b) => b.textContent === "Connect Adena");

    it("without Adena, draws no line under its box and no Connect Adena: its placeholder says it speaks as a guest, the menu how to log in", () => {
      phone();
      const view = mount(<GuestWriter room="#games" />);
      expect(connect(view)).toBeUndefined();
      expect(view.textContent).not.toContain("use a computer");
      expect(view.textContent).not.toContain("You speak as");
    });

    it("says in its placeholder that it speaks as a guest", () => {
      phone();
      const box = one(mount(<GuestWriter room="#games" />), "form textarea");
      expect(box.getAttribute("placeholder")).toBe("Message #games as a guest");
      expect(box.parentElement?.querySelector(`label[for="${box.id}"]`)?.textContent).toBe("Message #games");
    });

    it("with Adena (a computer's narrow window), keeps Connect Adena", () => {
      phone();
      vi.stubGlobal("adena", { AddEstablish: () => undefined });
      const view = mount(<GuestWriter room="#games" />);
      expect(connect(view)).toBeDefined();
      expect(view.textContent).not.toContain("use a computer");
    });
  });
});
