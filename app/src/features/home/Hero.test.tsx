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

  // f0008 lights the line's count, its figure and its word, over the rest of the line (#f4f5f9 against #c8d0de, the design review of 7n).
  test("marks the line's count, its figure and its word, apart from the universe's name", async () => {
    expect(await heroWith("main", 534)).toMatch(
      /<h1[^>]*><strong [^>]*><span [^>]*data-hero="figure"[^>]*>534<\/span> worlds<\/strong> in Mainland<\/h1>/,
    );
    expect(await heroWith("main", undefined, true)).toMatch(
      /<h1[^>]*><strong [^>]*><span [^>]*data-hero="figure"[^>]*><\/span> worlds<\/strong> in Mainland<\/h1>/,
    );
    expect(await heroWith("main", undefined)).not.toContain("<strong");
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

  // ADR-0003 §3: the video's pair, "Go explore" then "Join the chat" (frame 4); "See the list" repeated the List tab. Go explore's address is
  // the Earth's, which a new tab opens; its click flies to the busiest world.
  test("points its two actions, Go explore then Join the chat, at the universe's own Earth", async () => {
    const html = await heroOf("lab");
    expect([...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([^<]+)/g)].map((match) => [match[1], match[2]])).toEqual([
      ["/net/lab/earth", "Go explore"],
      ["/net/lab/earth", "Join the chat"],
    ]);
    expect(html).not.toContain("See the list");
  });

  test("fills Go explore alone, and outlines Join the chat", async () => {
    const html = await heroOf("main");
    expect(html).toMatch(/<a [^>]*data-emphasis="solid"[^>]*>Go explore/);
    expect(html).toMatch(/<a (?![^>]*data-emphasis)[^>]*data-call="chat"[^>]*>Join the chat/);
  });
});

// ADR-0003 §2, 2a: the line says what a world is, after the count the page's heading holds.
describe("the hero's line", () => {
  const lineOf = (html: string) => /data-hero="line"[^>]*>(.*?)<\/div>/s.exec(html)?.[1]?.replace(/<[^>]*>/g, "");

  test("says each world is a place to talk, after the count, outside the page's heading", async () => {
    const html = await heroWith("main", 534);
    expect(lineOf(html)).toBe("534 worlds in Mainland. Each one is a place to talk.");
    expect(headingOf(html)).toBe("534 worlds in Mainland");
  });

  test("says it while the number comes, and once none came", async () => {
    expect(lineOf(await heroWith("main", undefined, true))).toBe(" worlds in Mainland. Each one is a place to talk.");
    expect(lineOf(await heroWith("main", undefined))).toBe("Worlds in Mainland. Each one is a place to talk.");
  });

  test("says it of one world as the decision words it (F4514)", async () => {
    expect(lineOf(await heroOf("lab"))).toBe("1 world in Lab. Each one is a place to talk.");
  });

  // Nothing fake (ADR-0003, Constraints): a universe that holds no world has no place to talk to speak of.
  test("says nothing of places to talk in a universe that holds no world", async () => {
    expect(lineOf(await heroWith("main", 0))).toBe("0 worlds in Mainland");
  });
});

// ADR-0003 §3, one filled call at a time: on a first visit "Start here" in the Earth's label is the one, so the actions are marked for it,
// and the stylesheet outlines Go explore and keeps Join the chat for the return where the cosmos's labels stand (from 900 px).
describe("the hero's actions for a newcomer", () => {
  const actionsOf = (html: string) => /<div [^>]*data-hero="actions"[^>]*>/.exec(html)?.[0] ?? "";

  test("marks the actions as a first visit's for a newcomer, keeping both links in the page", async () => {
    const html = await render(
      { path: "/", Component: () => <Hero universe={universeOf("main")} worlds={2} newcomer /> },
      "/",
    );
    expect(actionsOf(html)).toContain("data-first");
    expect(html).toContain(">Go explore");
    expect(html).toContain(">Join the chat");
  });

  // F4518: the first visit's look holds only where the cosmos stands, which the universe marks (Universe.test); the build writes none.
  test("writes its actions as standing beside no cosmos, which the universe marks once it stands", async () => {
    expect(actionsOf(await heroOf("main"))).toContain('data-cosmos="none"');
  });

  test("leaves the actions unmarked for a reader who came back, and by default", async () => {
    expect(actionsOf(await heroOf("main"))).not.toContain("data-first");
    const back = await render(
      { path: "/", Component: () => <Hero universe={universeOf("main")} worlds={2} newcomer={false} /> },
      "/",
    );
    expect(actionsOf(back)).not.toContain("data-first");
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
    expect(html).toMatch(/<\/h1>[^<]*<\/div><div[^>]*data-hero="actions"/);
  });
});
