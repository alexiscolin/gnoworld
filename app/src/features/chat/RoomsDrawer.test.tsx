// @vitest-environment jsdom
import { MemoryRouter } from "react-router";
import { StoreProvider } from "../../storeContext.tsx";
import { describe, expect, it } from "vitest";
import { all, button, click, mount } from "../../../tests/mount.tsx";
import { RoomsDrawer } from "./RoomsDrawer.tsx";

// The rooms on a phone: one control, and a drawer with the rooms, then the worlds below them.
const draw = (unread = 0, phone = true) =>
  mount(
    <StoreProvider>
      <MemoryRouter>
        <RoomsDrawer
          unread={unread}
          phone={phone}
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
    expect(all(draw(3), "button")[0]?.textContent).toContain("Rooms, 3 unread");
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

  it("is a start-side drawer with a 44 px control on a phone", () => {
    const box = draw();
    expect(button(box, "Rooms")?.getAttribute("data-size")).toBe("m");
    click(button(box, "Rooms"));
    expect(document.querySelector("dialog[open]")?.hasAttribute("data-side")).toBe(true);
  });
});
