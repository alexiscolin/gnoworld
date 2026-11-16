// @vitest-environment jsdom
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { all, mount, one, settled } from "../../../tests/mount.tsx";
import type { ChatPlace } from "./ChatScreen.tsx";
import { PlacePageProvider } from "./placePage.ts";
import { PageButton, PlacePage } from "./PlaceSheet.tsx";

// The plate is the route's own element, lazy: this stands in for it.
const asked = vi.hoisted(() => ({ broken: false }));
function Plate() {
  if (asked.broken) throw new TypeError("Failed to fetch dynamically imported module: /a.js");
  return <p data-plate="x">the page</p>;
}

const place: ChatPlace = {
  slug: "x",
  name: "Golf",
  description: "d",
  kicker: "k",
  home: "/",
  worlds: [],
  universe: { id: "gnoland", isDefault: true, gnoweb: "https://gno.land" },
};
const at = (plate: ReactNode, child: ReactNode) => mount(<PlacePageProvider value={plate}>{child}</PlacePageProvider>);

describe("a place's page on a phone", () => {
  it("offers its control only for a place whose route gave a plate", () => {
    expect(all(at(<Plate />, <PageButton onOpen={() => undefined} />), "button")).toHaveLength(1);
    expect(all(at(null, <PageButton onOpen={() => undefined} />), "button")).toEqual([]);
  });

  it("draws the plate in the plate's own frame: its panel, its container, its scroller", async () => {
    const box = at(<Plate />, <PlacePage place={place} />);
    await settled(() => all(box, "[data-plate]").length === 1);
    const panel = one(box, "section[data-look='plate']");
    expect(panel.getAttribute("aria-label")).toBe("Golf");
    expect(panel.querySelector("[data-content] [data-plate]")).not.toBeNull();
  });

  it("says the page could not be shown, in the app's words, when its plate fails", () => {
    asked.broken = true;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const box = at(<Plate />, <PlacePage place={place} />);
    expect(all(box, "[role='alert']")).toHaveLength(1);
    expect(all(box, "[data-plate]")).toEqual([]);
    asked.broken = false;
  });
});
