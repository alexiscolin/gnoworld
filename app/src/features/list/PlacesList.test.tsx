// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { PlacesList } from "./PlacesList.tsx";

const genres = [
  { slug: "game", name: "Game" },
  { slug: "tool", name: "Tool" },
];
const places = [
  { slug: "arcade", name: "Arcade", description: "Games.", path: "/w/arcade", genres: ["game"] },
  { slug: "forge", name: "Forge", description: "Tools.", path: "/w/forge", genres: ["tool"] },
  { slug: "bubble", name: "Bubble", description: "Bubble.", path: "/w/bubble", genres: [] },
];

let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

function draw(props: Parameters<typeof PlacesList>[0]): HTMLElement {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root?.render(
      <MemoryRouter>
        <PlacesList {...props} />
      </MemoryRouter>,
    ),
  );
  return host;
}
// Each place is a card (slice 5r): its link holds the name and the description, so a place is read by its name.
const NAME = '[class*="name"]';
const shown = (el: HTMLElement) =>
  [...el.querySelectorAll(`ul[aria-label="Places"] a ${NAME}`)].map((t) => t.textContent);
const button = (el: HTMLElement, name: string) => {
  const found = [...el.querySelectorAll("button")].find((b) => b.textContent === name);
  if (!found) throw new Error(`no button ${name}`);
  return found;
};
const click = (b: HTMLElement) => {
  act(() => {
    b.click();
  });
};

describe("PlacesList", () => {
  it("lists every place as a link to its path, all of them while no genre is chosen", () => {
    const el = draw({ places, genres });
    expect(shown(el)).toEqual(["Arcade", "Forge", "Bubble"]);
    expect(el.querySelector(`a[href="/w/forge"] ${NAME}`)?.textContent).toBe("Forge");
  });

  it("offers each genre as a toggle button in a group named Genres, none pressed at first", () => {
    const el = draw({ places, genres });
    const group = el.querySelector('[role="group"][aria-label="Genres"]');
    expect(
      [...(group?.querySelectorAll("button") ?? [])].map((b) => [b.textContent, b.getAttribute("aria-pressed")]),
    ).toEqual([
      ["Game", "false"],
      ["Tool", "false"],
    ]);
  });

  it("filters by a genre on a click, and shows all again when it is clicked off", () => {
    const el = draw({ places, genres });
    click(button(el, "Game"));
    expect(shown(el)).toEqual(["Arcade"]);
    expect(button(el, "Game").getAttribute("aria-pressed")).toBe("true");
    click(button(el, "Game"));
    expect(shown(el)).toEqual(["Arcade", "Forge", "Bubble"]);
  });

  it("filters by several genres at once, a place once", () => {
    const el = draw({ places, genres });
    click(button(el, "Game"));
    click(button(el, "Tool"));
    expect(shown(el)).toEqual(["Arcade", "Forge"]);
  });

  it("toggles one genre off while two are chosen: only the other stays, and only it stays pressed", () => {
    const el = draw({ places, genres });
    click(button(el, "Game"));
    click(button(el, "Tool"));
    click(button(el, "Game"));
    expect(shown(el)).toEqual(["Forge"]);
    expect([button(el, "Game"), button(el, "Tool")].map((b) => b.getAttribute("aria-pressed"))).toEqual([
      "false",
      "true",
    ]);
  });

  // The keyboard: a native button is in the tab order and Enter and Space press it (jsdom presses no key: only a browser proves it, and no data holds a genre yet to build such a page from, so the
  // journey tries the list's links by keyboard, places.spec.ts).
  it("draws each filter as a native button the keyboard reaches: no tabindex, type button", () => {
    const el = draw({ places, genres });
    for (const b of el.querySelectorAll("button")) {
      expect(b.hasAttribute("tabindex")).toBe(false);
      expect(b.getAttribute("type")).toBe("button");
    }
  });

  it("says plainly when the filter leaves no place, with a way to clear it", () => {
    const el = draw({ places: places.slice(0, 1), genres });
    click(button(el, "Tool"));
    expect(el.querySelector('ul[aria-label="Places"]')).toBeNull();
    expect(el.textContent).toMatch(/no place of this genre/i);
    click(button(el, "Clear the filter"));
    expect(shown(el)).toEqual(["Arcade"]);
  });

  it("says plainly that the data holds no place, and shows no filter, when it is empty", () => {
    const el = draw({ places: [], genres: [] });
    expect(el.textContent).toMatch(/no place yet/i);
    expect(el.querySelector('[role="group"]')).toBeNull();
    expect(el.querySelectorAll("a")).toHaveLength(0);
  });

  it("draws a place's words as text, never as markup", () => {
    const el = draw({
      places: [{ slug: "x", name: "<b>x</b>", description: "<script>1</script>", path: "/w/x", genres: [] }],
      genres: [],
    });
    expect(el.querySelector("b, script")).toBeNull();
    expect(el.querySelector(`a ${NAME}`)?.textContent).toBe("<b>x</b>");
    expect(el.querySelector("a b")).toBeNull();
  });
});

// Slice 5p: the phone's list shows each place with its planet thumbnail. No world has a capture yet, so none shows a
// preview, and no empty frame or broken picture stands in its place; a thumb is the drawn fallback of `ui`.
describe("PlacesList thumbnails", () => {
  const items = (el: HTMLElement) => [...el.querySelectorAll('ul[aria-label="Places"] > li')];

  it("a world with no capture shows no preview: no figure, no frame, no picture but its thumb", () => {
    const el = draw({ places, genres });
    expect(el.querySelectorAll("figure, picture, video, canvas, iframe, [data-preview]")).toHaveLength(0);
    for (const item of items(el)) {
      const pictures = [...item.querySelectorAll("img")];
      expect(pictures).toHaveLength(1);
      expect(pictures[0]?.closest("[data-kind]")).not.toBeNull();
    }
  });

  it("each place has a planet thumbnail, the drawn fallback, decorative beside the name", () => {
    const el = draw({ places, genres });
    expect(items(el)).toHaveLength(3);
    for (const item of items(el)) {
      expect(item.querySelectorAll("[data-fallback]")).toHaveLength(1);
      expect(item.querySelector("img")?.getAttribute("alt")).toBe("");
    }
    expect(shown(el)).toEqual(["Arcade", "Forge", "Bubble"]);
  });

  it("no picture is empty, from another host or a path that is not the site's: nothing broken to draw", () => {
    const el = draw({ places, genres });
    expect(el.querySelectorAll("img")).toHaveLength(3);
    for (const img of el.querySelectorAll("img")) {
      const src = img.getAttribute("src") ?? "";
      expect(src).not.toBe("");
      expect(src.startsWith("/") || src.startsWith("data:image/")).toBe(true);
      expect(img.getAttribute("referrerpolicy")).toBe("no-referrer");
    }
  });

  it("a place that a genre filter shows again keeps its thumb, and one filtered out has none left", () => {
    const el = draw({ places, genres });
    click(button(el, "Game"));
    expect(items(el)).toHaveLength(1);
    expect(items(el)[0]?.querySelectorAll("img")).toHaveLength(1);
    expect(el.querySelectorAll("img")).toHaveLength(1);
    click(button(el, "Game"));
    expect(items(el)).toHaveLength(3);
  });
});

// Slice 5r (F3157, F3266): the list's cards are the prototype's .hubcard: a planet, the name and the description in one link.
describe("PlacesList's cards", () => {
  it("draws each place as one card: one link to its page, its name, then its description, a planet before them", () => {
    const el = draw({ places, genres });
    const cards = [...el.querySelectorAll("ul[aria-label='Places'] > li")];
    expect(cards).toHaveLength(3);
    for (const [index, card] of cards.entries()) {
      const place = places[index];
      expect(card.querySelectorAll("a")).toHaveLength(1);
      expect(card.querySelector("a")?.getAttribute("href")).toBe(place?.path);
      expect(card.textContent).toBe(`${place?.name ?? ""}${place?.description ?? ""}`);
      // F3157: the planet is inside the one link, so tapping it opens the place.
      expect(card.querySelector("a img, a svg")).not.toBeNull();
    }
  });

  it("keeps the planet decorative, since the name already names the place", () => {
    const el = draw({ places, genres });
    for (const picture of el.querySelectorAll("ul[aria-label='Places'] img")) {
      expect(picture.getAttribute("alt")).toBe("");
    }
  });

  it("draws no loose paragraph or quiet button beside a card: the link is the whole card", () => {
    const el = draw({ places, genres });
    expect(el.querySelectorAll("ul[aria-label='Places'] li > p, ul[aria-label='Places'] li > button")).toHaveLength(0);
  });
});
