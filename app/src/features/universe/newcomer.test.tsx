// @vitest-environment jsdom
import { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "../../../tests/mount.tsx";
import { useEntered, useNewcomer } from "./newcomer.ts";

// A newcomer as the page reads it (ADR-0003 §4): the device's memory once hydrated, a return's in the markup the build writes, for the build
// knows no device; and the place a reader enters, kept as its page shows.
function Says() {
  return <p>{useNewcomer() ? "new" : "back"}</p>;
}
function Enters() {
  useEntered();
  return null;
}

afterEach(() => {
  localStorage.clear();
});

describe("the page's newcomer", () => {
  it("reads a device that kept nothing as a newcomer's once in the browser, and as a return's in the build's markup", () => {
    expect(mount(<Says />).textContent).toBe("new");
    expect(renderToStaticMarkup(<Says />)).toBe("<p>back</p>");
  });

  it("hydrates the build's markup with no mismatch, then reads the device (F4504)", () => {
    // The build's markup for it, "<p>back</p>" (the first test), laid in the page as the browser reads it.
    const box = document.createElement("div");
    box.append(Object.assign(document.createElement("p"), { textContent: "back" }));
    document.body.append(box);
    const onRecoverableError = vi.fn();
    let root: Root | undefined;
    act(() => {
      root = hydrateRoot(box, <Says />, { onRecoverableError });
    });
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(box.textContent).toBe("new");
    act(() => {
      root?.unmount();
    });
    box.remove();
  });

  it("is no newcomer on a device that entered a place", () => {
    localStorage.setItem("gnoworld:entered", "1");
    expect(mount(<Says />).textContent).toBe("back");
  });

  it("keeps the place entered as its page shows, and not before", () => {
    renderToStaticMarkup(<Enters />);
    expect(localStorage.getItem("gnoworld:entered")).toBeNull();
    mount(<Enters />);
    expect(localStorage.getItem("gnoworld:entered")).toBe("1");
  });
});
