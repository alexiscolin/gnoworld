// @vitest-environment jsdom
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { button, click, mount, one } from "../../../tests/mount.tsx";
import { sheetOf, useSheet } from "./phoneSheet.ts";
import { sheetHref } from "./placePage.ts";

// The sheets' own history: the address holds which sheet is open, so Back closes one at a time and a reload or a link opens it.
function Probe() {
  const { sheet, move } = useSheet();
  const navigate = useNavigate();
  const at = useLocation();
  return (
    <>
      <output>{`${at.pathname}${at.search}|${sheet ?? "none"}`}</output>
      <button
        type="button"
        onClick={() => {
          move("info");
        }}
      >
        info
      </button>
      <button
        type="button"
        onClick={() => {
          move("page");
        }}
      >
        page
      </button>
      <button
        type="button"
        onClick={() => {
          move(undefined);
        }}
      >
        close
      </button>
      <button
        type="button"
        onClick={() => {
          Promise.resolve(navigate(-1)).catch(reportError);
        }}
      >
        Back
      </button>
    </>
  );
}
const draw = (...entries: string[]) => {
  // jsdom has no reportError, which the hook names for a failed move.
  vi.stubGlobal("reportError", vi.fn());
  return mount(
    <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
      <Probe />
    </MemoryRouter>,
  );
};
const now = (box: HTMLElement) => one(box, "output").textContent;
const press = (box: HTMLElement, name: string) => {
  click(button(box, name));
};

describe("the sheets in the address", () => {
  it("reads and writes the parameter, ignoring any other value", () => {
    expect(sheetOf(new URLSearchParams("sheet=page"))).toBe("page");
    expect(sheetOf(new URLSearchParams("sheet=x"))).toBeUndefined();
    expect(sheetHref("/r/gov/dao", "page")).toBe("/r/gov/dao?sheet=page");
    expect(sheetHref("/r/a?chat=full#top", "info")).toBe("/r/a?chat=full&sheet=info#top");
  });

  it("opens each sheet by a new entry, so Back closes the page to the info, then the info, then leaves for the page before", () => {
    const box = draw("/", "/r/a?chat=full");
    press(box, "info");
    expect(now(box)).toBe("/r/a?chat=full&sheet=info|info");
    press(box, "page");
    expect(now(box)).toBe("/r/a?chat=full&sheet=page|page");
    press(box, "Back");
    expect(now(box)).toBe("/r/a?chat=full&sheet=info|info");
    press(box, "Back");
    expect(now(box)).toBe("/r/a?chat=full|none");
    press(box, "Back");
    expect(now(box)).toBe("/|none");
  });

  it("closes by going back over its own entry, so the next Back leaves the place", () => {
    const box = draw("/", "/r/a?chat=full");
    press(box, "info");
    press(box, "close");
    expect(now(box)).toBe("/r/a?chat=full|none");
    press(box, "Back");
    expect(now(box)).toBe("/|none");
  });

  it("goes back from the page to the info the same way", () => {
    const box = draw("/", "/r/a?chat=full");
    press(box, "info");
    press(box, "page");
    press(box, "info");
    press(box, "close");
    press(box, "Back");
    expect(now(box)).toBe("/|none");
  });

  it("opens from an address that holds it (a reload, a link) and closes it by a replace, keeping the entry before", () => {
    const box = draw("/", "/r/a?chat=full&sheet=page");
    expect(now(box)).toBe("/r/a?chat=full&sheet=page|page");
    press(box, "info");
    expect(now(box)).toBe("/r/a?chat=full&sheet=info|info");
    press(box, "close");
    expect(now(box)).toBe("/r/a?chat=full|none");
    press(box, "Back");
    expect(now(box)).toBe("/|none");
  });
});
