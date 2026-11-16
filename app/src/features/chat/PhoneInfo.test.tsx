// @vitest-environment jsdom
import { createRef, useEffect } from "react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { all, click, modals, mount, one, settled } from "../../../tests/mount.tsx";
import type { ChatPlace } from "./ChatScreen.tsx";
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
const sheet = (open: boolean, onClose: () => void) =>
  mount(
    <MemoryRouter>
      <PhoneInfo
        open={open}
        onClose={onClose}
        place={place}
        talking={undefined}
        room={undefined}
        people={null}
        panelRef={createRef()}
      />
    </MemoryRouter>,
  );

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

  it("closes when a link inside it leaves for another page, never for one opening in a new tab", () => {
    const onClose = vi.fn();
    const box = sheet(true, onClose);
    const [out] = all(box, "a[target='_blank']");
    click(out);
    expect(onClose).not.toHaveBeenCalled();
    const inside = document.createElement("a");
    inside.href = "/w/x";
    one(box, "aside").append(inside);
    click(inside);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("mounts the planet's view only once open", async () => {
    const before = view.mounted;
    sheet(false, () => undefined);
    expect(view.mounted).toBe(before);
    sheet(true, () => undefined);
    await settled(() => view.mounted === before + 1);
  });
});
