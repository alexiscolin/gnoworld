// @vitest-environment jsdom
import { act, createRef, useEffect } from "react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { all, button, click, modals, mount, one, settled } from "../../../tests/mount.tsx";
import type { ChatPlace } from "./ChatScreen.tsx";
import { PlacePageProvider } from "./placePage.ts";
import { PhoneInfo } from "./PhoneInfo.tsx";

// The small view of space needs the store, the router and an engine: Info's own tests read the links, these the sheet.
// PlaceView alone reaches the planet's lazy chunks (MiniSpace, the signs): the sheet must not mount it while closed.
const view = vi.hoisted(() => ({ mounted: 0 }));
vi.mock("./PlaceView.tsx", () => ({
  PlaceView: () => {
    useEffect(() => {
      view.mounted += 1;
    }, []);
    return null;
  },
}));
modals();

const place: ChatPlace = {
  slug: "x",
  name: "golf",
  description: "d",
  kicker: "k",
  home: "/",
  worlds: [],
  universe: { id: "onyx", isDefault: false, gnoweb: "https://onyx.example" },
};
const dialogOf = (box: HTMLElement): HTMLDialogElement => {
  const found = one(box, "dialog");
  if (!(found instanceof HTMLDialogElement)) throw new Error("not a dialog");
  return found;
};
const draw = (open: boolean, onClose: () => void, page: { paged?: boolean; onPage?: (paged: boolean) => void } = {}) =>
  mount(
    <MemoryRouter>
      <PlacePageProvider value={<p data-plate="x">the page</p>}>
        <PhoneInfo
          open={open}
          paged={page.paged ?? false}
          onPage={page.onPage ?? (() => undefined)}
          onClose={onClose}
          place={place}
          talking={undefined}
          room={undefined}
          people={null}
          panelRef={createRef()}
        />
      </PlacePageProvider>
    </MemoryRouter>,
  );
const sheet = (open: boolean, onClose: () => void) => draw(open, onClose);

describe("the info sheet of a phone", () => {
  it("holds the full chat's info when open, under the place's name", () => {
    const box = sheet(true, () => undefined);
    expect(dialogOf(box).open).toBe(true);
    expect(one(box, "aside").getAttribute("aria-label")).toBe("golf");
  });

  it("draws none of the info while closed", () => {
    const box = sheet(false, () => undefined);
    expect(all(box, "aside")).toEqual([]);
    expect(dialogOf(box).open).toBe(false);
  });

  it("asks to close from its Close control", () => {
    const onClose = vi.fn();
    click(all(sheet(true, onClose), "button").find((each) => each.getAttribute("aria-label") === "Close"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("leaves a link that goes to another page to the router, whose address drops the sheet, and never closes for a new tab", () => {
    const onClose = vi.fn();
    const box = sheet(true, onClose);
    click(all(box, "a[target='_blank']")[0]);
    const inside = document.createElement("a");
    inside.href = "/w/x";
    inside.addEventListener("click", (event) => {
      event.preventDefault();
    });
    one(box, "aside").append(inside);
    click(inside);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes the sheet for a link to a place that is not in it (#chat is the chat behind it), and stops the jump", () => {
    const onClose = vi.fn();
    const box = sheet(true, onClose);
    const jump = document.createElement("a");
    jump.setAttribute("href", "#chat");
    one(box, "aside").append(jump);
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    act(() => {
      jump.dispatchEvent(event);
    });
    expect(onClose).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it("keeps a link to a place on its own page open, scrolling to it with no history entry", () => {
    const onClose = vi.fn();
    const scrolled = vi.fn();
    Object.assign(HTMLElement.prototype, { scrollIntoView: scrolled });
    const box = sheet(true, onClose);
    const target = document.createElement("section");
    target.id = "page";
    const jump = document.createElement("a");
    jump.setAttribute("href", "#page");
    one(box, "aside").append(target, jump);
    const before = location.hash;
    click(jump);
    expect(onClose).not.toHaveBeenCalled();
    expect(scrolled).toHaveBeenCalledOnce();
    expect(location.hash).toBe(before);
  });

  it("asks for the page from its button, and draws the page under the place's name, with a way back to the info", async () => {
    const onPage = vi.fn();
    click(
      button(
        draw(true, () => undefined, { onPage }),
        "Its page",
      ),
    );
    expect(onPage).toHaveBeenCalledWith(true);
    const onClose = vi.fn();
    const box = draw(true, onClose, { paged: true, onPage });
    await settled(() => all(box, "[data-plate]").length === 1);
    expect(all(box, "aside")).toEqual([]);
    expect(one(box, "h2").textContent).toBe("golf");
    click(button(box, "Back to Info"));
    expect(onPage).toHaveBeenLastCalledWith(false);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("goes back to the info, not out of the sheet, on Close or Escape while the page shows", () => {
    const onPage = vi.fn();
    const onClose = vi.fn();
    click(
      all(draw(true, onClose, { paged: true, onPage }), "button").find(
        (each) => each.getAttribute("aria-label") === "Close",
      ),
    );
    expect(onPage).toHaveBeenCalledWith(false);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows the kicker and the title once each: the info's own, then the page's under the name", () => {
    const words = (box: HTMLElement, text: string) =>
      all(box, "*").filter((each) => each.children.length === 0 && each.textContent === text).length;
    const info = sheet(true, () => undefined);
    expect(words(info, "k")).toBe(1);
    expect(words(info, "Info")).toBe(1);
    expect(
      words(
        draw(true, () => undefined, { paged: true }),
        "k",
      ),
    ).toBe(1);
  });

  it("mounts the planet's view only once open", async () => {
    const before = view.mounted;
    sheet(false, () => undefined);
    expect(view.mounted).toBe(before);
    sheet(true, () => undefined);
    await settled(() => view.mounted === before + 1);
  });
});
