import { EVALS, FUNCTIONS } from "../chain/chainFixture.ts";
import { queryEnvelope, statusEnvelope } from "@gnoworld/chain/testing/envelopes";
import { indexer } from "../chain/indexerRoute.ts";
import { violations } from "./callCard.ts";
import { expect, hydrated, test, type Page } from "./fixtures.ts";

// 5i's journey (plan §1, ADR-0002 §4): a realm's read functions are buttons; a click reads one call through vm/qeval, free, and
// nothing opens Adena. The RPC is answered here as a browser would get it, from the recorded answers; whether a real RPC
// answers a browser at all is F2841, so a refused read is a state, never a blocker.
const RPC = "https://rpc.onyx.testnets.gno.land/**";
const REALM = "gno.land/r/gnoland/wugnot";
const SUPPLY = EVALS.find((row) => row.chain === "onyx-1" && row.expr === "TotalSupply()")?.body ?? "";
const LABEL = "read on chain, free, no signature";

const decode = (hex: string): string => decodeURIComponent(hex.replace(/(..)/g, "%$1"));

interface Seen {
  evals: string[];
  funcs: number;
  /** Every request the RPC got, by its path or its query, in order. */
  all: string[];
}
interface Answers {
  functions?: unknown;
  evals?: Record<string, string>;
  /** Every read but the height is cut off, as a browser whose RPC sends no CORS header sees it (F2841). */
  fail?: boolean;
}

// What the chain gives for a query: the list for qfuncs, a call's text for qeval (or its refusal), a short page for the rest.
function answer(url: URL, seen: Seen, { functions, evals }: { functions: unknown; evals: Record<string, string> }) {
  const query = (url.searchParams.get("path") ?? "").replaceAll('"', "");
  const data = decode((url.searchParams.get("data") ?? "").slice(2));
  if (query === "vm/qfuncs") {
    seen.funcs += 1;
    return queryEnvelope({ data: JSON.stringify(functions) });
  }
  if (query !== "vm/qeval") return queryEnvelope({ data: "# wrapped GNOT" });
  seen.evals.push(data);
  const text = evals[/\.([A-Za-z0-9_]+)\(\)$/.exec(data)?.[1] ?? ""];
  return text === undefined
    ? queryEnvelope({ data: null, error: { "@type": "/abci.StringError", value: "refused" } })
    : queryEnvelope({ data: text });
}

// qfuncs gives `functions`, qeval gives `evals[name]` (or the chain's refusal), qrender a short page, /status a height.
async function chain(
  page: Page,
  { functions = FUNCTIONS, evals = { TotalSupply: SUPPLY }, fail = false }: Answers = {},
) {
  const seen: Seen = { evals: [], funcs: 0, all: [] };
  await indexer(page);
  await page.route(RPC, async (route) => {
    const url = new URL(route.request().url());
    const headers = { "access-control-allow-origin": "*", "content-type": "application/json" };
    seen.all.push(url.searchParams.get("path")?.replaceAll('"', "") ?? url.pathname);
    if (fail && url.pathname !== "/status") {
      await route.abort();
      return;
    }
    if (url.pathname === "/status") {
      await route.fulfill({ headers, body: JSON.stringify(statusEnvelope(786661, "2026-10-30T23:43:10Z")) });
      return;
    }
    const body = answer(url, seen, { functions, evals });
    await route.fulfill({ headers, body: JSON.stringify(body) });
  });
  return seen;
}

// Every method and property of `window.adena` that anything touches is kept, in `__touched`: a connect prompt, an account, a signature.
async function watchAdena(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const touched: string[] = [];
    const wallet = new Proxy(
      {},
      {
        get(_target, key) {
          touched.push(String(key));
          return () => Promise.reject(new Error("no wallet here"));
        },
      },
    );
    Object.assign(window, { __touched: touched });
    Object.defineProperty(window, "adena", { value: wallet, configurable: true });
  });
}
const touched = (page: Page) =>
  page.evaluate(() => {
    const list: unknown = Reflect.get(window, "__touched");
    return Array.isArray(list) ? list.map(String) : ["no list"];
  });

// The page holds no horizontal scroll: nothing, a long name included, is wider than the screen.
const fits = async (page: Page) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
};
const reads = (page: Page) => page.getByRole("region", { name: "Read functions" });
// Try it's rows: a function is a row that opens in place, and its "Read X" button is inside (shut rows are inert).
const rows = (page: Page) => reads(page).getByRole("button", { name: /^\w+\(/ });
// A read takes nothing: the row's own click opens it and reads (its Read button is for reading again).
const readFn = (page: Page, name: string) =>
  reads(page)
    .getByRole("button", { name: new RegExp(`^${name}\\(`) })
    .click();
const readers = (names: string[], type = "int64") =>
  names.map((FuncName) => ({ FuncName, Params: null, Results: [{ Name: ".res.0", Type: type, Value: "" }] }));

test.describe("a realm's read functions", () => {
  test("a click reads one call, free, with its label and height, and opens no wallet", async ({ page }) => {
    await watchAdena(page);
    const seen = await chain(page);
    await page.goto("/r/gnoland/wugnot");
    await hydrated(page);
    await expect(rows(page)).toHaveCount(1);
    await expect(reads(page)).not.toContainText("Withdraw");
    expect(seen.funcs).toBe(1);
    expect(seen.evals).toEqual([]);
    await expect(page.getByRole("main")).toContainText("Read at block");
    const before = seen.all.length;
    await page.evaluate(() => {
      const list: unknown = Reflect.get(window, "__touched");
      if (Array.isArray(list)) list.length = 0;
    });
    await readFn(page, "TotalSupply");
    await expect(reads(page)).toContainText(SUPPLY);
    await expect(reads(page)).toContainText(LABEL);
    await expect(reads(page)).toContainText("block 786,661");
    // The note and the result's box share one left edge.
    const left = (text: string | RegExp) =>
      reads(page)
        .getByText(text)
        .evaluate((el) => el.getBoundingClientRect().left);
    expect(await left(LABEL)).toBe(
      await reads(page)
        .getByRole("region", { name: "Result of TotalSupply" })
        .evaluate((el) => el.getBoundingClientRect().left),
    );
    expect(seen.evals).toEqual([`${REALM}.TotalSupply()`]);
    // A click is two requests, the call and the height it is stamped with, and nothing after: no list again, no poll.
    await page.waitForTimeout(1500);
    expect(seen.all.slice(before).sort()).toEqual(["/status", "vm/qeval"]);
    expect(seen.funcs).toBe(1);
    // No wallet method touched (no connect prompt, no account, no signature), no dialog.
    expect(await touched(page)).toEqual([]);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("lists nothing hostile: a name that closes the call is never a button and never asked", async ({ page }) => {
    const names = ["TotalSupply()); Render(", "Foo.Bar", "_helper", "Ａ", "TotalSupply"];
    const seen = await chain(page, { functions: readers(names) });
    await page.goto("/r/gnoland/wugnot");
    await hydrated(page);
    await expect(rows(page)).toHaveCount(1);
    await readFn(page, "TotalSupply");
    await expect(reads(page)).toContainText(LABEL);
    expect(seen.evals).toEqual([`${REALM}.TotalSupply()`]);
  });

  test("a refused read is a state with the link to gnoweb, and the page stands", async ({ page }) => {
    await chain(page, { evals: {} });
    await page.goto("/r/gnoland/wugnot");
    await hydrated(page);
    await readFn(page, "TotalSupply");
    await expect(reads(page).getByRole("status")).toContainText("The chain refused this read");
    await expect(reads(page).getByRole("link", { name: "Open on gnoweb" })).toHaveAttribute(
      "href",
      "https://onyx.testnets.gno.land/r/gnoland/wugnot",
    );
    await expect(page.getByRole("main")).toContainText("wrapped GNOT");
  });

  test("a browser that cannot reach the RPC sees a state, not a blank (F2841)", async ({ page }) => {
    await chain(page, { fail: true });
    await page.goto("/r/gnoland/wugnot");
    await hydrated(page);
    // The read is tried again twice, with a backoff (D13973), before it is a state: about 3 s, said in words.
    await expect(reads(page)).toContainText("Trying again…");
    await expect(reads(page).getByRole("status")).toContainText(/Try again/, { timeout: 15_000 });
    await expect(reads(page).getByRole("link", { name: "Open on gnoweb" })).toBeVisible();
  });

  test("a long list is searchable", async ({ page }) => {
    const many = readers(Array.from({ length: 30 }, (_, i) => `Get${String(i).padStart(2, "0")}Value`));
    await chain(page, { functions: many, evals: { Get07Value: "(seven string)" } });
    await page.goto("/r/gnoland/wugnot");
    await hydrated(page);
    // A page of 12, the foot counting them; the filter reads all thirty.
    await expect(rows(page)).toHaveCount(12);
    await expect(reads(page)).toContainText("12 of 30");
    await reads(page).getByRole("textbox", { name: "Filter read functions" }).fill("get07");
    await expect(rows(page)).toHaveCount(1);
    await readFn(page, "Get07Value");
    await expect(reads(page)).toContainText("(seven string)");
  });

  for (const [name, width, height] of [
    ["a phone", 390, 844],
    ["a computer", 1280, 900],
  ] as const) {
    test(`has no accessibility violation on ${name}, listed, read and failed`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await chain(page, { evals: {} });
      await page.goto("/r/gnoland/wugnot");
      await hydrated(page);
      await expect(rows(page)).toHaveCount(1);
      expect(await violations(page)).toEqual([]);
      await readFn(page, "TotalSupply");
      await expect(reads(page).getByRole("status")).toBeVisible();
      expect(await violations(page)).toEqual([]);
      await page.unroute(RPC);
      await chain(page);
      await reads(page).getByRole("button", { name: "Read TotalSupply" }).click();
      await expect(reads(page)).toContainText(LABEL);
      expect(await violations(page)).toEqual([]);
      await fits(page);
    });

    test(`has no accessibility violation on ${name} with a result taller than its frame, which takes focus`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      const long = Array.from({ length: 200 }, (_, i) => `line ${String(i)} of a long answer`).join("\n");
      await chain(page, { evals: { TotalSupply: long } });
      await page.goto("/r/gnoland/wugnot");
      await hydrated(page);
      await readFn(page, "TotalSupply");
      const result = reads(page).getByRole("region", { name: "Result of TotalSupply" });
      await expect(result).toContainText("line 199 of a long answer");
      expect(await result.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
      await result.focus();
      await expect(result).toBeFocused();
      expect(await violations(page)).toEqual([]);
      await fits(page);
    });

    test(`has no accessibility violation on ${name} with a long list, its search and a name of 128 characters`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      const wide = `A${"b".repeat(127)}`;
      const many = readers([wide, ...Array.from({ length: 30 }, (_, i) => `Get${String(i).padStart(2, "0")}Value`)]);
      await chain(page, { functions: many, evals: { [wide]: "(x string)" } });
      await page.goto("/r/gnoland/wugnot");
      await hydrated(page);
      await expect(reads(page).getByRole("textbox", { name: "Filter read functions" })).toBeVisible();
      expect(await violations(page)).toEqual([]);
      await fits(page);
      await readFn(page, wide);
      await expect(reads(page)).toContainText(LABEL);
      expect(await violations(page)).toEqual([]);
      await fits(page);
    });
  }

  test.describe("as it looks", () => {
    test.use({ timezoneId: "UTC", locale: "en-GB" });

    for (const [name, width, height] of [
      ["phone", 390, 844],
      ["computer", 1280, 900],
    ] as const) {
      test(`the panel listed and after a read, on a ${name}'s screen`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await chain(page);
        await page.goto("/r/gnoland/wugnot");
        await hydrated(page);
        await expect(rows(page)).toHaveCount(1);
        await expect(reads(page)).toHaveScreenshot(`read-functions-listed-${name}.png`);
        await readFn(page, "TotalSupply");
        await expect(reads(page)).toContainText(LABEL);
        await expect(reads(page)).toHaveScreenshot(`read-functions-read-${name}.png`);
      });
    }
  });
});
