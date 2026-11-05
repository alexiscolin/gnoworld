// The files a search engine reads (slice 5's 5e): sitemap.xml names the mainnet's places, at their canonical addresses, and
// robots.txt names the sitemap. A testnet's pages exist but are noindex and out of the sitemap (decisions, 2026-10-29).
// Limits from sitemaps.org/protocol.html (read 2026-10-29): 50,000 URLs and 50 MB uncompressed a file. Values need entity escapes,
// but a Slug is [a-z0-9-] (packages/schemas/src/data.ts) and the origin is constant: nothing here holds a character to escape.
import { placesFrom } from "./dataPlaces.ts";

const ORIGIN = "https://gno.world";
const MAX_URLS = 50_000;

interface Row {
  slug: string;
  universe: string;
}

export function sitemapXml(data: {
  universes: { id: string; default?: boolean | undefined; testnet?: boolean | undefined }[];
  hubs: Row[];
  ecosystems: Row[];
}): string {
  const mainnet = new Set(
    data.universes.filter((universe) => universe.testnet !== true).map((universe) => universe.id),
  );
  const urls = [
    ...placesFrom(data)
      .filter((place) => mainnet.has(place.universe))
      .map((place) => ORIGIN + place.canonical),
    `${ORIGIN}/list`,
  ];
  // ponytail: one file; past the cap the protocol wants several and an index, which this site does not write.
  if (urls.length > MAX_URLS)
    throw new RangeError(`sitemap: ${String(urls.length)} urls, more than the 50,000 a file may hold`);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((url) => `<url><loc>${url}</loc></url>`),
    "</urlset>",
    "",
  ].join("\n");
}

/** Every crawler may read everything: a testnet page is kept out by its noindex, which a crawler must be allowed to read. */
export function robotsTxt(): string {
  return `User-agent: *\n\nSitemap: ${ORIGIN}/sitemap.xml\n`;
}
