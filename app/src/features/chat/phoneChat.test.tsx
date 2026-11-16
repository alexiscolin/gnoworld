// @vitest-environment jsdom
import type { ComponentProps } from "react";
import { Link, MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { all, button, click, mount } from "../../../tests/mount.tsx";
import { FullProvider } from "./full.ts";
import { PhoneTop } from "./phoneChat.tsx";

// The sheet's own content is PhoneInfo.test.tsx's: here it is only open or shut.
vi.mock("./PhoneInfo.tsx", () => ({
  PhoneInfo: ({ open }: { open: boolean }) => (open ? <p>The info sheet</p> : null),
}));

// A phone's header and its Info sheet, drawn by `PhoneTop`, with links to move to another address.
function Probe() {
  return (
    <>
      <PhoneTop
        header={{ title: "#games", rooms: null, acts: [] }}
        info={
          {
            place: { kicker: "k" },
            talking: undefined,
            room: undefined,
            people: null,
          } as unknown as ComponentProps<typeof PhoneTop>["info"]
        }
        screen={{ current: null }}
      />
      <Link to="/r/news?chat=full#links">Links</Link>
      <Link to="/r/other?chat=full">Other</Link>
    </>
  );
}

const draw = () =>
  mount(
    <MemoryRouter initialEntries={["/r/news?chat=full"]}>
      <FullProvider value>
        <Probe />
      </FullProvider>
    </MemoryRouter>,
  );

describe("a phone's Info sheet", () => {
  it("opens at Info", () => {
    const box = draw();
    expect(all(box, "p")).toHaveLength(0);
    click(button(box, "Info"));
    expect(all(box, "p").map((p) => p.textContent)).toEqual(["The info sheet"]);
  });

  it("stays open as a link changes only the page's hash, and shuts as another page opens", () => {
    const box = draw();
    click(button(box, "Info"));
    click(box.querySelector<HTMLElement>("a[href$='#links']") ?? undefined);
    expect(all(box, "p")).toHaveLength(1);
    click(box.querySelector<HTMLElement>("a[href='/r/other?chat=full']") ?? undefined);
    expect(all(box, "p")).toHaveLength(0);
  });
});
