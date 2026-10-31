import { describe, expect, test } from "vitest";
import { render } from "../../../tests/render.tsx";
import { siteOf } from "../../places.ts";
import { PLANTED } from "../../placesFixture.ts";
import { Hero } from "./Hero.tsx";

// The hero's big number counts the worlds of the universe the page is: all of them, none a sample. The real data holds one
// world in Onyx and none in gno.land, so the site is planted, with two worlds in its default universe.
const planted = siteOf(PLANTED);
const heroOf = (id: string) => {
  const universe = planted.universes.find((each) => each.id === id);
  if (universe === undefined) throw new RangeError(id);
  return render({ path: "/", Component: () => <Hero universe={universe} /> }, "/");
};
const numberOf = (html: string) => /data-hero="number"[^>]*>\s*(?:<[^>]*>\s*)*([^<\s]+)/.exec(html)?.[1];

describe("the hero's big number, on a planted site", () => {
  test("counts the worlds of the universe, in the plural", async () => {
    const html = await heroOf("main");
    expect(numberOf(html)).toBe("2");
    expect(html).toMatch(/\b2 worlds\b/);
  });

  test("counts one world in the singular, in the other universe", async () => {
    const html = await heroOf("lab");
    expect(numberOf(html)).toBe("1");
    expect(html).toMatch(/\b1 world\b/);
    expect(html).not.toMatch(/\b1 worlds\b/);
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
    expect(html).toMatch(/<h1[^>]*>2 worlds in Mainland<\/h1><div[^>]*data-hero="actions">/);
  });
});
