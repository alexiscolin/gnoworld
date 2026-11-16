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
vi.mock("./PlaceView.tsx", async (original) => ({
  ...(await original<typeof import("./PlaceView.tsx")>()),
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

  it("shows the kicker and the name once each, in the title row, for the info and for the page", () => {
    const words = (box: HTMLElement, text: string) =>
      all(box, "*").filter((each) => each.children.length === 0 && each.textContent === text).length;
    for (const paged of [false, true]) {
      const box = draw(true, () => undefined, { paged });
      expect(words(box, "k")).toBe(1);
      expect(words(box, "golf")).toBe(1);
      expect(words(box, "Info")).toBe(0);
    }
  });

  it("puts Back at the title row's start while the page shows, so the focus goes Back, title, Close, and none of the info", async () => {
    const box = draw(true, () => undefined, { paged: true });
    await settled(() => all(box, "[data-plate]").length === 1);
    const names = all(box, "button").map((each) => each.getAttribute("aria-label"));
    expect(names.slice(0, 2)).toEqual(["Back to Info", "Close"]);
    const back = one(box, "button[aria-label='Back to Info']");
    expect(back.compareDocumentPosition(one(box, "h2")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(all(box, "button").every((each) => each.textContent !== "Back to Info")).toBe(true);
  });

  it("ends the info with the Credits button, and not the page", async () => {
    const info = sheet(true, () => undefined);
    expect(all(info, "button").some((each) => each.textContent === "Credits")).toBe(true);
    const page = draw(true, () => undefined, { paged: true });
    await settled(() => all(page, "[data-plate]").length === 1);
    expect(all(page, "button").some((each) => each.textContent === "Credits")).toBe(false);
  });

  it("leads with the place's picture, not Back, while the info shows", () => {
    const box = draw(true, () => undefined);
    expect(all(box, "button").map((each) => each.getAttribute("aria-label"))).not.toContain("Back to Info");
  });

  it("never draws the planet: the band over the chat holds it, and a second view would make a second WebGL context", async () => {
    sheet(false, () => undefined);
    sheet(true, () => undefined);
    await settled(() => document.querySelector("dialog[open]") !== null);
    expect(view.mounted).toBe(0);
  });
});
