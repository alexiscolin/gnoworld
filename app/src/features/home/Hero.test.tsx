import { describe, expect, test } from "vitest";
import { headingOf, render } from "../../../tests/render.tsx";
import { siteOf } from "../../places.ts";
import { PLANTED } from "../../placesFixture.ts";
import { Hero } from "./Hero.tsx";

// The hero's big number counts the worlds it is given: the page says how many (the cosmos's, or a universe's list). The real data
// holds one world in Onyx and none in gno.land, so the site is planted, with two worlds in its default universe.
const planted = siteOf(PLANTED);
const universeOf = (id: string) => {
  const universe = planted.universes.find((each) => each.id === id);
  if (universe === undefined) throw new RangeError(id);
  return universe;
};
const heroWith = (id: string, worlds: number | undefined, coming = false) =>
  render({ path: "/", Component: () => <Hero universe={universeOf(id)} worlds={worlds} coming={coming} /> }, "/");
const heroOf = (id: string) => heroWith(id, universeOf(id).worlds.length);
const numberOf = (html: string) => /data-hero="number"[^>]*>\s*(?:<[^>]*>\s*)*([^<\s]+)/.exec(html)?.[1];

describe("the hero's big number, on a planted site", () => {
  test("counts the worlds of the universe, in the plural", async () => {
    const html = await heroOf("main");
    expect(numberOf(html)).toBe("2");
    expect(headingOf(html)).toBe("2 worlds in Mainland");
  });

  test("shows no number while none is known, and names the worlds without one", async () => {
    const html = await heroWith("main", undefined);
    expect(html).toMatch(/data-hero="number"[^>]*>\s*<\/p>/);
    expect(headingOf(html)).toBe("Worlds in Mainland");
  });

  // 7n: the number comes after the page, and the actions beside the line must not slide when it does (frames 2 to 8 never move).
  test("keeps its figure's room in the line while the number comes: an empty figure, then the words", async () => {
    const html = await heroWith("main", undefined, true);
    expect(html).toMatch(/data-hero="number"[^>]*>\s*<\/p>/);
    expect(html).toMatch(/data-hero="figure"[^>]*><\/span>/);
    expect(headingOf(html)).toBe(" worlds in Mainland");
  });

  test("sets the number in the line's figure once it has come", async () => {
    const html = await heroWith("main", 534, false);
    expect(html).toMatch(/data-hero="figure"[^>]*>534<\/span>/);
    expect(headingOf(html)).toBe("534 worlds in Mainland");
  });

  test("counts the number it is given, the cosmos's own", async () => {
    const html = await heroWith("main", 534);
    expect(numberOf(html)).toBe("534");
    expect(headingOf(html)).toBe("534 worlds in Mainland");
  });

  test("counts one world in the singular, in the other universe", async () => {
    const html = await heroOf("lab");
    expect(numberOf(html)).toBe("1");
    expect(headingOf(html)).toBe("1 world in Lab");
  });

  test("points its two actions at the universe's own Earth and at the list", async () => {
    const html = await heroOf("lab");
    expect([...html.matchAll(/<a [^>]*href="([^"]+)"/g)].map((match) => match[1])).toEqual(["/net/lab/earth", "/list"]);
  });
});

// F3267: the hero as the frames draw it: a kicker with its dot over the number, and the line and the actions on one row.
describe("the hero's parts", () => {
  test("opens with the kicker and its warm dot, the universe's name in the one label style", async () => {
    const html = await heroOf("main");
    expect(html).toMatch(
      /<p class="label [^"]*"><span class="[^"]*" data-tone="warm" aria-hidden="true"><\/span>gno\.world<\/p>/,
    );
    expect(html.indexOf("gno.world")).toBeLessThan(html.indexOf('data-hero="number"'));
  });

  test("names a universe that is not the default by its own name", async () => {
    expect(await heroOf("lab")).toMatch(/data-tone="warm"[^>]*><\/span>Lab<\/p>/);
  });

  test("makes the line the page's one heading, and sets it beside the actions, in one row", async () => {
    const html = await heroOf("main");
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(headingOf(html)).toBe("2 worlds in Mainland");
    expect(html).toMatch(/<\/h1><div[^>]*data-hero="actions">/);
  });
});
