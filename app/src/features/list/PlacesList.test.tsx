// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
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
  act(() => root?.render(<PlacesList {...props} />));
  return host;
}
const shown = (el: HTMLElement) => [...el.querySelectorAll('ul[aria-label="Places"] a')].map((a) => a.textContent);
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
    expect(el.querySelector('a[href="/w/forge"]')?.textContent).toBe("Forge");
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
    expect(el.querySelector("a")?.textContent).toBe("<b>x</b>");
  });
});
