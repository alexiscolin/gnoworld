import { queryEnvelope, statusEnvelope } from "@gnoworld/chain/testing/envelopes";
import type { Page } from "../e2e/fixtures.ts";
import { FUNCTIONS } from "./chainFixture.ts";
import { indexer } from "./indexerRoute.ts";

// The onyx RPC answered in a journey as a browser would get it (the recorded answers of tests/chain), so a realm's page never reaches the
// real network.
export const RPC = "https://rpc.onyx.testnets.gno.land/**";
const HEIGHT = 786661;
const TIME = "2026-10-30T23:43:10Z";

// Page of the realm the browser asks: `pages` by realm path, the rest "no page".
export async function chain(page: Page, pages: Record<string, string>): Promise<{ asked: string[] }> {
  const asked: string[] = [];
  await indexer(page);
  await page.route(RPC, async (route) => {
    const url = new URL(route.request().url());
    // A request is told by its query (vm/qrender, vm/qfuncs, vm/qeval) when it has one, by its path otherwise (/status).
    const query = (url.searchParams.get("path") ?? "").replaceAll('"', "");
    asked.push(query === "" ? url.pathname : query);
    const cors = { "access-control-allow-origin": "*", "content-type": "application/json" };
    if (url.pathname === "/status") {
      await route.fulfill({ headers: cors, body: JSON.stringify(statusEnvelope(HEIGHT, TIME)) });
      return;
    }
    if (query === "vm/qfuncs") {
      await route.fulfill({ headers: cors, body: JSON.stringify(queryEnvelope({ data: JSON.stringify(FUNCTIONS) })) });
      return;
    }
    const hex = (url.searchParams.get("data") ?? "").slice(2);
    const realm = decodeURIComponent(hex.replace(/(..)/g, "%$1")).split(":")[0] ?? "";
    const body = pages[realm];
    await route.fulfill({
      headers: cors,
      body: JSON.stringify(
        body === undefined
          ? queryEnvelope({ data: null, error: { "@type": "/vm.InvalidPkgPathError" } })
          : queryEnvelope({ data: body }),
      ),
    });
  });
  return { asked };
}
