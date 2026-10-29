import { placesFrom } from "./dataPlaces.ts";
import { describe, expect, test } from "vitest";
import { robotsTxt, sitemapXml } from "./sitemap.ts";
import { FIXTURE } from "./placesFixture.ts";

// Slice 5's 5e. sitemaps.org/protocol.html, read 2026-10-29: "no more than 50,000 URLs" a file, "no larger than 50MB
// (52,428,800 bytes)" uncompressed, every value entity-escaped, and robots.txt names it with `Sitemap: <full url>`.
// The plan's figure, from memory, was right. Decisions 2026-10-29: the sitemap holds the mainnet's places only.
const data = {
  ...FIXTURE,
  universes: FIXTURE.universes.map((universe) => ({ ...universe, testnet: universe.id === "onyx" })),
};
const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((match) => match[1]);
const LIST = "https://gno.world/list";

describe("sitemapXml", () => {
  test("is a urlset of the sitemap protocol, one url a loc", () => {
    const xml = sitemapXml(data);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml.match(/<url>/g)).toHaveLength(locs(xml).length);
  });

  test("names each mainnet place once, at its canonical address, and the list", () => {
    const mainnet = placesFrom(data).filter((place) => place.universe === "gnoland");
    expect(mainnet.map((place) => place.kind).sort()).toEqual(["cosmos", "earth", "ecosystem", "world"]);
    expect(locs(sitemapXml(data)).sort()).toEqual(
      [...mainnet.map((place) => `https://gno.world${place.canonical}`), LIST].sort(),
    );
  });

  test("names no testnet place, at its path or at its canonical address", () => {
    const found = locs(sitemapXml(data));
    for (const place of placesFrom(data).filter((each) => each.universe === "onyx")) {
      expect(found).not.toContain(`https://gno.world${place.canonical}`);
      expect(found).not.toContain(`https://gno.world${place.path}`);
    }
    expect(found.some((loc) => loc?.includes("/net/onyx/"))).toBe(false);
  });

  test("names each address once, none of a place's plain path", () => {
    const found = locs(sitemapXml(data));
    expect(new Set(found).size).toBe(found.length);
    for (const loc of found) expect(loc === LIST || loc?.startsWith("https://gno.world/net/gnoland/")).toBe(true);
  });

  // The cap is the protocol's: past it a second file and an index are needed, which the site does not have.
  test("takes 50,000 urls and refuses one more, naming the limit", () => {
    const many = (hubs: number) => ({
      ...data,
      hubs: Array.from({ length: hubs }, (_, n) => ({
        slug: `w${String(n)}`,
        name: "W",
        description: "W".repeat(60),
        universe: "gnoland",
      })),
    });
    // What the fixture holds besides the worlds (the cosmos, the Earth, an ecosystem, the list), counted, not written down.
    const others = locs(sitemapXml(many(0))).length;
    expect(locs(sitemapXml(many(50_000 - others)))).toHaveLength(50_000);
    expect(() => sitemapXml(many(50_001 - others))).toThrow(/50,000/);
  });

  // Onyx is the default universe in the data; the day gno.land is, a mainnet place's path is no longer its address.
  test("names the canonical address, never the plain path, when the mainnet is the default universe", () => {
    const swapped = {
      ...data,
      universes: [
        { id: "onyx", name: "Onyx", testnet: true },
        { id: "gnoland", name: "gno.land", default: true as const, testnet: false },
      ],
    };
    const mainnet = placesFrom(swapped).filter((place) => place.universe === "gnoland");
    expect(mainnet.some((place) => place.path !== place.canonical)).toBe(true);
    expect(locs(sitemapXml(swapped)).sort()).toEqual(
      [...mainnet.map((place) => `https://gno.world${place.canonical}`), LIST].sort(),
    );
    expect(locs(sitemapXml(swapped))).not.toContain("https://gno.world/");
    expect(locs(sitemapXml(swapped))).not.toContain("https://gno.world/w/other");
  });
});

describe("robotsTxt", () => {
  test("allows every crawler and names the sitemap by its full address", () => {
    const lines = robotsTxt().trim().split("\n");
    expect(lines).toContain("User-agent: *");
    expect(lines).toContain("Sitemap: https://gno.world/sitemap.xml");
    expect(lines.filter((line) => line.startsWith("Sitemap:"))).toHaveLength(1);
  });

  // A crawler that may not fetch a testnet page never reads its noindex: the page would stay indexed by its links.
  test("blocks no path: a testnet page is kept out by its noindex, which a crawler must be allowed to read", () => {
    expect(robotsTxt()).not.toMatch(/^Disallow:\s*\S/m);
  });
});
