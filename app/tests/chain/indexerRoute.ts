import type { Page } from "../e2e/fixtures.ts";

// 5k: the public indexer answered in a journey as a browser would get it, so a realm's view never reaches the real network.
// THE ANSWER IS SYNTHETIC (F2950): no indexer answer has been recorded through gnomcp; the shape is the schema's own.
const INDEXER = "https://indexer.onyx.testnets.gno.land/**";
const CORS = { "access-control-allow-origin": "*", "content-type": "application/json" };

const FACTS = {
  path: "gno.land/r/demo/hostile",
  deployer: "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5",
  firstBlock: 12345,
};

// The realm a request asks about, from its `variables`.
const realmOf = (url: string): string => {
  const variables = new URL(url).searchParams.get("variables") ?? "{}";
  const path = (JSON.parse(variables) as { path?: unknown }).path;
  return typeof path === "string" ? path : FACTS.path;
};

/** The indexer's requests so far, and how it answers: the facts of the realm asked, or a 503. */
export async function indexer(page: Page, { down = false }: { down?: boolean } = {}): Promise<{ asked: string[] }> {
  const asked: string[] = [];
  await page.route(INDEXER, async (route) => {
    const url = route.request().url();
    asked.push(url);
    await route.fulfill(
      down
        ? { status: 503, headers: CORS, body: "down" }
        : { headers: CORS, body: JSON.stringify({ data: { realmFacts: { ...FACTS, path: realmOf(url) } } }) },
    );
  });
  return { asked };
}
