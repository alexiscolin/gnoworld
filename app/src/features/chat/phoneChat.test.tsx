// @vitest-environment jsdom
import type { ComponentProps } from "react";
import { Link, MemoryRouter, useLocation } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { all, button, click, mount, one } from "../../../tests/mount.tsx";
import { FullProvider } from "./full.ts";
import { PhoneTop } from "./phoneChat.tsx";

// The sheet's own content is PhoneInfo.test.tsx's: here it is only open or shut.
vi.mock("./PhoneInfo.tsx", () => ({
  PhoneInfo: ({
    open,
    paged,
    onPage,
    onClose,
  }: {
    open: boolean;
    paged: boolean;
    onPage: (paged: boolean) => void;
    onClose: () => void;
  }) =>
    open ? (
      <>
        <p>{paged ? "The page sheet" : "The info sheet"}</p>
        <button
          type="button"
          onClick={() => {
            onPage(!paged);
          }}
        >
          flip
        </button>
        <button type="button" onClick={onClose}>
          shut
        </button>
      </>
    ) : null,
}));

// A phone's header and its Info sheet, drawn by `PhoneTop`, with links to move to another address.
function Probe() {
  const { search } = useLocation();
  return (
    <>
      <output>{search}</output>
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

const draw = (at = "/r/news?chat=full") => {
  vi.stubGlobal("reportError", vi.fn());
  return mount(
    <MemoryRouter initialEntries={["/", at]} initialIndex={1}>
      <FullProvider value>
        <Probe />
      </FullProvider>
    </MemoryRouter>,
  );
};
const sheets = (box: HTMLElement) => all(box, "p").map((p) => p.textContent);

describe("a phone's Info sheet", () => {
  it("opens at Info, by an entry whose address holds it", () => {
    const box = draw();
    expect(sheets(box)).toEqual([]);
    click(button(box, "Info"));
    expect(sheets(box)).toEqual(["The info sheet"]);
    expect(one(box, "output").textContent).toBe("?chat=full&sheet=info");
  });

  it("opens the page sheet from the info and closes it back to the info, then the info", () => {
    const box = draw();
    click(button(box, "Info"));
    click(button(box, "flip"));
    expect(sheets(box)).toEqual(["The page sheet"]);
    click(button(box, "flip"));
    expect(sheets(box)).toEqual(["The info sheet"]);
    click(button(box, "shut"));
    expect(sheets(box)).toEqual([]);
    expect(one(box, "output").textContent).toBe("?chat=full");
  });

  it("opens on a reload or a link that holds the parameter", () => {
    expect(sheets(draw("/r/news?chat=full&sheet=info"))).toEqual(["The info sheet"]);
    expect(sheets(draw("/r/news?chat=full&sheet=page"))).toEqual(["The page sheet"]);
  });

  it("shuts as another page opens", () => {
    const box = draw();
    click(button(box, "Info"));
    click(box.querySelector<HTMLElement>("a[href='/r/other?chat=full']") ?? undefined);
    expect(sheets(box)).toEqual([]);
  });
});
