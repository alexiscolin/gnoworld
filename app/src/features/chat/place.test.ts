import { describe, expect, it } from "vitest";
import type { UniverseView } from "../../places.ts";
import { chatPlace, whereOf } from "./place.ts";

const BUBBLE = {
  slug: "bubble",
  name: "Bubble",
  description: "",
  universe: "onyx",
  testnet: true,
  path: "/w/bubble",
  canonical: "/net/onyx/w/bubble",
};
const UNIVERSE: UniverseView = {
  id: "onyx",
  name: "Onyx",
  isDefault: true,
  testnet: true,
  home: { path: "/", canonical: "/net/onyx" },
  earth: { path: "/earth", canonical: "/net/onyx/earth" },
  worlds: [BUBBLE],
  ecosystems: [],
};

describe("chatPlace", () => {
  it("starts the column of worlds with the Earth, as the video's does, then the universe's worlds", () => {
    const { worlds } = chatPlace({ slug: "bubble", name: "Bubble", description: "", inPage: true }, UNIVERSE);
    expect(worlds.map(({ slug, href }) => [slug, href])).toEqual([
      ["earth", "/earth"],
      ["bubble", "/w/bubble"],
    ]);
  });

  it("says where a place is without its name, which the band's name line says already", () => {
    expect(whereOf("Onyx · Bubble", "Bubble")).toBe("Onyx");
    expect(whereOf("Earth · General chat", "Earth")).toBe("General chat");
    expect(whereOf("@gov · dao", "dao")).toBe("@gov");
    expect(whereOf("Somewhere else", "Bubble")).toBe("Somewhere else");
    expect(whereOf("Bubble", "Bubble")).toBe("Bubble");
  });
});
