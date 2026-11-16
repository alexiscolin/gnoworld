// @vitest-environment jsdom
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { all, mount, one, settled } from "../../../tests/mount.tsx";
import type { ChatPlace } from "./ChatScreen.tsx";
import { chunked } from "./Failing.tsx";
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
    expect(all(at(undefined, <PageButton onOpen={() => undefined} />), "button")).toEqual([]);
  });

  it("is the sheet's solid primary, with no floating tip and no press over the whole sheet (stretch's hover paints the fill dark)", () => {
    const button = one(at(<Plate />, <PageButton primary onOpen={() => undefined} />), "button");
    expect(button.getAttribute("data-emphasis")).toBe("solid");
    expect(button.hasAttribute("data-stretch")).toBe(false);
    expect(button.hasAttribute("title")).toBe(false);
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

  it("scrolls to the section the address names (#page: the realm's page, the proposals) once the plate is drawn", async () => {
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled(this.id);
    };
    history.replaceState(null, "", "/r/gov/dao?sheet=page#section");
    const box = at(
      <section id="section">
        <Plate />
      </section>,
      <PlacePage place={place} />,
    );
    await settled(() => all(box, "[data-plate]").length === 1);
    expect(scrolled).toHaveBeenCalledWith("section");
    history.replaceState(null, "", "/");
  });

  it("scrolls nowhere when the address names no section of the page", async () => {
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    history.replaceState(null, "", "/r/gov/dao?sheet=page#chat");
    const box = at(<Plate />, <PlacePage place={place} />);
    await settled(() => all(box, "[data-plate]").length === 1);
    expect(scrolled).not.toHaveBeenCalled();
    history.replaceState(null, "", "/");
  });

  describe("a plate in a chunk of its own, as the routes make it", () => {
    const later = () => {
      let arrive: () => void = () => undefined;
      const Late = chunked(
        () =>
          new Promise<{ default: () => ReactNode }>((done) => {
            arrive = () => {
              done({
                default: () => (
                  <section id="section">
                    <p data-plate="x">the page</p>
                  </section>
                ),
              });
            };
          }),
        { waiting: null, failed: () => null },
      );
      return {
        Late,
        arrive: () => {
          arrive();
        },
      };
    };

    it("says it loads while the chunk comes, and draws a computer's waiting as nothing", async () => {
      const { Late, arrive } = later();
      const later2 = later();
      const box = at(<Late />, <PlacePage place={place} />);
      expect(one(box, "[role='status']").textContent).toBe("Loading the page…");
      expect(mount(<later2.Late />).textContent, "a computer's plate waiting draws nothing").toBe("");
      arrive();
      await settled(() => all(box, "[data-plate]").length === 1);
      expect(all(box, "[role='status']")).toEqual([]);
    });

    it("scrolls to the section once the chunk has drawn it, though the sheet was drawn before", async () => {
      const scrolled = vi.fn();
      Element.prototype.scrollIntoView = function (this: Element) {
        scrolled(this.id);
      };
      history.replaceState(null, "", "/r/gov/dao?sheet=page#section");
      const { Late, arrive } = later();
      const box = at(<Late />, <PlacePage place={place} />);
      expect(scrolled).not.toHaveBeenCalled();
      arrive();
      await settled(() => all(box, "[data-plate]").length === 1);
      await settled(() => scrolled.mock.calls.length === 1);
      expect(scrolled).toHaveBeenCalledWith("section");
      history.replaceState(null, "", "/");
    });
  });
});
