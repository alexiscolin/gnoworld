// @vitest-environment jsdom
import { act, createRef, useEffect, type ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { all, click, modals, mount, one, settled } from "../../../tests/mount.tsx";
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
const draw = (open: boolean, onClose: () => void, plate: ReactNode = <p data-plate="x">the page</p>) =>
  mount(
    <MemoryRouter>
      <PlacePageProvider value={plate}>
        <PhoneInfo
          open={open}
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
const swipe = (target: Element, dy: number) => {
  const at = (type: string, y: number) =>
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: 50, clientY: y }));
  act(() => {
    at("pointerdown", 20);
    at("pointerup", 20 + dy);
  });
};

describe("the place's sheet of a phone", () => {
  it("is one sheet: the page above, the info's parts at its foot, no Back and no Its page", async () => {
    const box = sheet(true, () => undefined);
    await settled(() => all(box, "[data-plate]").length === 1);
    expect(dialogOf(box).open).toBe(true);
    const names = all(box, "button").map((each) => each.getAttribute("aria-label") ?? each.textContent);
    expect(names).toContain("Back to the chat");
    expect(names).not.toContain("Its page");
    expect(names.some((name) => name.startsWith("Back to Info"))).toBe(false);
    const plate = one(box, "[data-plate]");
    expect(plate.compareDocumentPosition(one(box, "aside")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(all(box, "button").some((each) => each.textContent === "Credits")).toBe(true);
    expect(all(box, "a[target='_blank']").length).toBeGreaterThan(0);
  });

  it("shows the foot alone for a place with no page, with its description", () => {
    const box = draw(true, () => undefined, null);
    expect(all(box, "[data-plate]")).toEqual([]);
    expect(one(box, "aside").textContent).toContain("d");
    expect(all(box, "p").some((each) => each.textContent === "d")).toBe(true);
  });

  it("leaves the description to the page when there is one", async () => {
    const box = sheet(true, () => undefined);
    await settled(() => all(box, "[data-plate]").length === 1);
    expect(all(box, "p").some((each) => each.textContent === "d")).toBe(false);
  });

  it("draws nothing of it while closed", () => {
    const box = sheet(false, () => undefined);
    expect(all(box, "aside")).toEqual([]);
    expect(dialogOf(box).open).toBe(false);
  });

  it("asks to close from its close control, named for where it leads", () => {
    const onClose = vi.fn();
    click(all(sheet(true, onClose), "button").find((each) => each.getAttribute("aria-label") === "Back to the chat"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes by a swipe down that begins on the title row, not by a short one nor one in the content", async () => {
    const onClose = vi.fn();
    const box = sheet(true, onClose);
    await settled(() => all(box, "[data-plate]").length === 1);
    swipe(one(box, "h2"), 30);
    expect(onClose).not.toHaveBeenCalled();
    swipe(one(box, "[data-plate]"), 200);
    expect(onClose).not.toHaveBeenCalled();
    swipe(one(box, "h2"), 120);
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

  it("keeps a link to a place of its own open, scrolling to it with no history entry", () => {
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

  it("shows the kicker and the name once each, in the title row", () => {
    const words = (box: HTMLElement, text: string) =>
      all(box, "*").filter((each) => each.children.length === 0 && each.textContent === text).length;
    const box = sheet(true, () => undefined);
    expect(words(box, "k")).toBe(1);
    expect(words(box, "golf")).toBe(1);
  });

  it("never draws the planet: the band over the chat holds it, and a second view would make a second WebGL context", async () => {
    sheet(false, () => undefined);
    sheet(true, () => undefined);
    await settled(() => document.querySelector("dialog[open]") !== null);
    expect(view.mounted).toBe(0);
  });
});
