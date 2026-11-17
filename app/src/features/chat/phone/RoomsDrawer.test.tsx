// @vitest-environment jsdom
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { StoreProvider } from "../../../storeContext.tsx";
import { describe, expect, it } from "vitest";
import { act } from "react";
import { all, button, click, mount } from "../../../../tests/mount.tsx";
import { askFor } from "../../../pageAsks.ts";
import { RoomsDrawer } from "./RoomsDrawer.tsx";
import { asDrawer, RoomsList } from "../rooms/RoomsList.tsx";

// The rooms on a phone: one control, and a drawer with the rooms, then the worlds below them.
const draw = (unread = 0, phone = true, modes?: ReactNode) =>
  mount(
    <StoreProvider>
      <MemoryRouter>
        <RoomsDrawer
          unread={unread}
          phone={phone}
          modes={modes}
          rail={<a href="/r/news">news</a>}
          worlds={{
            worlds: [{ slug: "bubble", name: "Bubble", href: "/w/bubble" }],
            current: "x",
            universe: { id: "onyx", isDefault: true },
          }}
        />
      </MemoryRouter>
    </StoreProvider>,
  );

const notifications = () =>
  [...document.querySelectorAll<HTMLElement>("dialog[open] [data-drawer-body] button[aria-expanded]")].find((each) =>
    each.textContent.includes("Notifications"),
  );

describe("the rooms' drawer", () => {
  it("is shut until its control, named Rooms, is pressed", () => {
    const box = draw();
    expect(document.querySelector("dialog[open]")).toBeNull();
    click(button(box, "Rooms"));
    expect(document.querySelector("dialog[open]")?.getAttribute("aria-labelledby")).not.toBeNull();
  });

  it("holds the rooms first and the worlds below them, in one scrolling body", () => {
    click(button(draw(), "Rooms"));
    const body = document.querySelector("dialog[open] [data-drawer-body]");
    expect(all(body ?? document.body, "a").map((link) => link.textContent)).toEqual(["news", "Bubble"]);
  });

  it("says the unseen count in the control's name", () => {
    expect(button(draw(3), "Rooms, 3 unread")).toBeDefined();
    expect(button(draw(0), "Rooms")).toBeDefined();
  });

  it("closes as a link in it is followed, the worlds' too", () => {
    const box = draw();
    click(button(box, "Rooms"));
    const link = document.querySelector<HTMLElement>('dialog[open] a[href="/w/bubble"]');
    link?.addEventListener("click", (event) => {
      event.preventDefault();
    });
    click(link ?? undefined);
    expect(document.querySelector("dialog[open]")).toBeNull();
  });

  // A compact chat in a computer's window (900 px wide, say) is no phone: main's drawer, its small control, no worlds.
  it("keeps a computer's compact chat's small control and plain dialog, the rooms alone", () => {
    const box = draw(0, false);
    expect(button(box, "Rooms")?.getAttribute("data-size")).toBe("s");
    click(button(box, "Rooms"));
    const dialog = document.querySelector("dialog[open]");
    expect(dialog?.hasAttribute("data-side")).toBe(false);
    expect(dialog?.querySelector("[data-drawer-body]")).toBeNull();
    expect(all(dialog ?? document.body, "a").map((link) => link.textContent)).toEqual(["news"]);
  });

  it("is a start-side drawer with a # control, 44 px with its box, on a phone", () => {
    const box = draw();
    expect(button(box, "Rooms")?.getAttribute("data-size")).toBe("s");
    expect(button(box, "Rooms")?.classList.contains("hit")).toBe(true);
    click(button(box, "Rooms"));
    expect(document.querySelector("dialog[open]")?.hasAttribute("data-side")).toBe(true);
  });

  it("opens as the row's +N chip asks for the rooms", () => {
    draw();
    act(() => {
      askFor("rooms");
    });
    expect(document.querySelector("dialog[open]")).not.toBeNull();
  });

  it("leaves that ask to the header's own name menu in a computer's compact chat", () => {
    draw(0, false);
    act(() => {
      askFor("rooms");
    });
    expect(document.querySelector("dialog[open]")).toBeNull();
  });

  it("keeps the room's notification modes one press from the drawer's head, shut until pressed", () => {
    draw(0, true, <p>Notify me about</p>);
    click(button(document.body, "Rooms"));
    const toggle = notifications();
    expect(toggle?.textContent).toContain("Notifications");
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    click(toggle ?? undefined);
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
  });

  it("draws no modes row where there are none (a guest)", () => {
    click(button(draw(), "Rooms"));
    expect(notifications()).toBeUndefined();
  });

  it("gives its list no filter field up to 12 rooms, so the keyboard does not rise with the drawer, and one past them", () => {
    const rooms = (count: number) => [
      {
        name: null,
        rooms: Array.from({ length: count }, (_, at) => ({ room: `#r${String(at)}`, type: "open" as const })),
      },
    ];
    const open = (count: number) => {
      const box = mount(
        <StoreProvider>
          <MemoryRouter>
            {/* ChatScreen's roomsOf gives a phone's rail the drawer's look. */}
            <RoomsDrawer unread={0} phone rail={asDrawer(<RoomsList sections={rooms(count)} current="#r0" />)} />
          </MemoryRouter>
        </StoreProvider>,
      );
      click(button(box, "Rooms"));
      return document.querySelector("dialog[open] [data-drawer-body] input") !== null;
    };
    expect(open(12)).toBe(false);
    expect(open(13)).toBe(true);
  });

  it("keeps a computer's list's filter at any count", () => {
    mount(
      <StoreProvider>
        <MemoryRouter>
          <RoomsList sections={[{ name: null, rooms: [{ room: "#a", type: "open" }] }]} current="#a" />
        </MemoryRouter>
      </StoreProvider>,
    );
    expect(document.querySelector("input")).not.toBeNull();
  });
});
