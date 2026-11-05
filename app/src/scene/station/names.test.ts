// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { OPEN } from "../openEvent.ts";
import { StationNames, type Named, type Spot } from "./names.ts";

// The stations' names round the Earth (7x2, 8l): each a link to its world's page through the router where the file gives a slug, else to the
// project's own https address in a tab of its own, never a hostile address; over its station, hidden over the page's text; and the caption
// over them, gone with them.
const names = () => [...document.querySelectorAll<HTMLElement>("[data-stations] > :not(div)")];
const caption = () => document.querySelector<HTMLElement>("[data-stations] > div");
const made = () => {
  const open = vi.fn();
  const listen = (event: Event) => {
    open((event as CustomEvent<string>).detail);
  };
  window.addEventListener(OPEN, listen);
  const station = new StationNames(document);
  return {
    station,
    open,
    done: () => {
      window.removeEventListener(OPEN, listen);
      station.dispose();
    },
  };
};
const clicked = (name: HTMLElement | undefined, init: MouseEventInit = {}) =>
  !(name?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init })) ?? true);
const spot = (x: number, y: number, shown = true): Spot => ({ x, y, radius: 10, shown });
const SCREEN = { width: 1728, height: 1080, box: undefined };

afterEach(() => {
  document.body.replaceChildren();
});

describe("the stations' names", () => {
  it("opens a station's world page through the router, and leaves a click with a modifier to the browser", () => {
    const { station, open, done } = made();
    station.name([{ name: "Adena", url: "https://adena.app", slug: "adena" }]);
    const [adena] = names();
    expect(adena?.getAttribute("href")).toBe("/w/adena");
    expect(adena?.hasAttribute("target")).toBe(false);
    for (const init of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }])
      expect(clicked(adena, init)).toBe(false);
    expect(open).not.toHaveBeenCalled();
    expect(clicked(adena)).toBe(true);
    expect(open).toHaveBeenCalledWith("/w/adena");
    done();
  });

  it("opens a project with no world at its own https address in a tab of its own", () => {
    const { station, open, done } = made();
    station.name([{ name: "Outside", url: "https://outside.example" }]);
    const [outside] = names();
    expect(outside?.getAttribute("href")).toBe("https://outside.example");
    expect(outside?.getAttribute("target")).toBe("_blank");
    expect(outside?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(clicked(outside)).toBe(false);
    expect(open).not.toHaveBeenCalled();
    done();
  });

  it("links no hostile address, and names hostile words as words", () => {
    const { station, open, done } = made();
    const hostile: Named[] = [
      "javascript:alert(1)",
      "data:text/html,x",
      "//evil.example/",
      "http://plain.example",
      "",
    ].map((url, at) => ({ name: at === 0 ? "<img src=x onerror=alert(1)>" : `s${String(at)}`, url }));
    station.name(hostile);
    expect(names().every((name) => name.tagName === "SPAN" && !name.hasAttribute("href"))).toBe(true);
    expect(document.querySelector("[data-stations] img")).toBeNull();
    expect(names()[0]?.textContent).toBe("<img src=x onerror=alert(1)>");
    for (const name of names()) clicked(name);
    expect(open).not.toHaveBeenCalled();
    done();
  });

  it("hides a name over the page's text or off the screen, and the caption with the last name", () => {
    const { station, done } = made();
    station.name([
      { name: "A", url: "https://a.example" },
      { name: "B", url: "https://b.example" },
    ]);
    station.place([spot(900, 600), spot(1200, 700)], 1, SCREEN);
    expect(names().map((name) => name.hidden)).toEqual([false, false]);
    expect(caption()?.hidden).toBe(false);
    station.place([spot(900, 600), spot(1200, 700, false)], 1, {
      ...SCREEN,
      box: { left: 800, top: 500, right: 1000, bottom: 700 },
    });
    expect(names().map((name) => name.hidden)).toEqual([true, true]);
    expect(caption()?.hidden).toBe(true);
    station.place([spot(900, 600), spot(1200, 700)], 0, SCREEN);
    expect(caption()?.hidden, "a caption at no strength").toBe(true);
    done();
  });

  it("stands the caption over the names, its strength as given", () => {
    const { station, done } = made();
    station.name([{ name: "A", url: "https://a.example" }]);
    station.place([spot(900, 600)], 0.456, SCREEN);
    expect(caption()?.style.getPropertyValue("opacity")).toBe("0.46");
    expect(caption()?.textContent).toBe("StationsCurated by the gno.land team");
    done();
  });
});
