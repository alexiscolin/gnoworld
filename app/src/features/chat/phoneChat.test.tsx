// @vitest-environment jsdom
import { type ComponentProps, type ReactNode } from "react";
import { Link, MemoryRouter, useLocation } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { all, button, click, mount, one } from "../../../tests/mount.tsx";
import { FullProvider } from "./full.ts";
import { PhoneTop } from "./phoneChat.tsx";

// The sheet's own content is PhoneInfo.test.tsx's: here it is only open or shut.
vi.mock("./PhoneInfo.tsx", () => ({
  PhoneInfo: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <>
        <p>The sheet</p>
        <button type="button" onClick={onClose}>
          shut
        </button>
      </>
    ) : null,
}));

// The band (planet, key info, one press to Info) is PhoneBand.test.tsx's: here it is its press, its fold and the row it holds.
vi.mock("./PhoneBand.tsx", () => ({
  PhoneBand: ({ onInfo, folded, children }: { onInfo: () => void; folded: boolean; children: ReactNode }) => (
    <>
      <button type="button" data-band={folded ? "folded" : "open"} onClick={onInfo}>
        band
      </button>
      {children}
    </>
  ),
}));

// A phone's header and its Info sheet, drawn by `PhoneTop`, with links to move to another address.
function Probe() {
  const { search } = useLocation();
  return (
    <>
      <output>{search}</output>
      <PhoneTop
        header={{
          title: "#games",
          rooms: <i>rooms</i>,
          chips: <b>chips</b>,
          search: { label: "Search", icon: "search-messages" },
        }}
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

describe("a phone's place sheet", () => {
  it("draws no Back, and the place band with the rooms' row in it above the sheet", () => {
    const box = draw();
    expect(button(box, "Back")).toBeUndefined();
    expect(button(box, "band")?.getAttribute("data-band")).toBe("open");
    expect(one(box, "i").textContent + one(box, "b").textContent).toBe("roomschips");
  });

  it("opens the one sheet, the place's page, from the band's press, by one entry whose address holds it", () => {
    const box = draw();
    expect(sheets(box)).toEqual([]);
    click(button(box, "band"));
    expect(sheets(box)).toEqual(["The sheet"]);
    expect(one(box, "output").textContent).toBe("?chat=full&sheet=page");
  });

  it("closes to the chat's own address (the browser's Back: phoneSheet.test.tsx)", () => {
    const box = draw();
    click(button(box, "band"));
    click(button(box, "shut"));
    expect(sheets(box)).toEqual([]);
    expect(one(box, "output").textContent).toBe("?chat=full");
  });

  it("opens on a reload or a link that holds the parameter", () => {
    expect(sheets(draw("/r/news?chat=full&sheet=page"))).toEqual(["The sheet"]);
  });

  it("shuts as another page opens", () => {
    const box = draw();
    click(button(box, "band"));
    click(box.querySelector<HTMLElement>("a[href='/r/other?chat=full']") ?? undefined);
    expect(sheets(box)).toEqual([]);
  });
});
