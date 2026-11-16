// @vitest-environment jsdom
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { all, button, click, mount } from "../../../tests/mount.tsx";
import { RoomsDrawer } from "./RoomsDrawer.tsx";

// The rooms on a phone: one control, and a drawer with the rooms, then the worlds below them.
const draw = (unread = 0) =>
  mount(
    <MemoryRouter>
      <RoomsDrawer
        unread={unread}
        rail={<a href="/r/news">news</a>}
        worlds={
          <nav aria-label="Worlds">
            <a href="/w/bubble">Bubble</a>
          </nav>
        }
      />
    </MemoryRouter>,
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
});
