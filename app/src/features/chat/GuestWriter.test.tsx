// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mount, one } from "../../../tests/mount.tsx";
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
});
