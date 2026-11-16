// @vitest-environment jsdom
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { all, button, click, modals, mount, settled } from "../../../tests/mount.tsx";
import type { ChatPlace } from "./ChatScreen.tsx";
import { PlacePageProvider } from "./placePage.ts";
import { PlaceSheet } from "./PlaceSheet.tsx";

// The plate is the route's own element, lazy: this stands in for it.
const asked = vi.hoisted(() => ({ broken: false }));
function Plate() {
  if (asked.broken) throw new Error("the plate failed");
  return <p data-plate="x">the page</p>;
}
modals();

const place = (more: Partial<ChatPlace>): ChatPlace => ({
  slug: "x",
  name: "Golf",
  description: "d",
  kicker: "k",
  home: "/",
  worlds: [],
  universe: { id: "gnoland", isDefault: true, gnoweb: "https://gno.land" },
  ...more,
});
const at = (plate: ReactNode) =>
  mount(
    <PlacePageProvider value={plate}>
      <PlaceSheet place={place({})} />
    </PlacePageProvider>,
  );

describe("a place's page in a sheet", () => {
  it("draws the plate the route gave only after the press", async () => {
    const box = at(<Plate />);
    expect(all(box, "[data-plate]")).toEqual([]);
    click(button(box, "Its page"));
    await settled(() => all(box, "[data-plate]").length === 1);
    expect(all(box, "[data-plate]").map((each) => each.textContent)).toEqual(["the page"]);
  });

  it("draws no control for a place whose route gave no plate", () => {
    expect(all(at(null), "button")).toEqual([]);
  });

  it("says the page could not be shown, with a way to close, when its plate fails", async () => {
    asked.broken = true;
    const box = at(<Plate />);
    click(button(box, "Its page"));
    await settled(() => all(box, "[role='alert']").length === 1);
    expect(all(box, "[role='alert']")[0]?.textContent).toMatch(/could not be shown/i);
    asked.broken = false;
  });
});
