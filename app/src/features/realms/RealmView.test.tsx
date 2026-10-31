// @vitest-environment jsdom
import { act } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { PAGES } from "../../../tests/chain/chainFixture.ts";
import { queryEnvelope, rpcErrorEnvelope, statusEnvelope } from "../../../tests/chain/chainEnvelopes.ts";
import { all, button, click, follows, mount, one } from "../../../tests/mount.tsx";
import type { ChainFetch } from "../../lib/chain/read.ts";
import { RealmView } from "./RealmView.tsx";

// 5h: a realm's view reads its page and the block height once through lib/chain, and shows what it read, the cap's state or the
// failed read's state, each with the link to the realm on gnoweb. The answers are the recorded ones (chainFixture.ts: PAGES).
const COINS = PAGES.find((row) => row.realm === "gno.land/r/gnoland/coins");
const WUGNOT = PAGES[1];
const CHAIN = { name: "Onyx", chainId: "onyx-1", rpc: "https://rpc.onyx.testnets.gno.land:443" };

// A fetch that answers /status with a height and any query with `page`; or fails as `fail` says.
function chain(page: string | null, { status = true, error }: { status?: boolean; error?: string } = {}) {
  return vi.fn<ChainFetch>((url) => {
    const body = url.includes("/status")
      ? status
        ? statusEnvelope(786661, "2026-10-30T23:43:10Z")
        : rpcErrorEnvelope("down")
      : error === undefined
        ? queryEnvelope({ data: page })
        : rpcErrorEnvelope(error);
    return Promise.resolve(new Response(JSON.stringify(body)));
  });
}

async function view(fetcher: ChainFetch, realm = "gno.land/r/gnoland/wugnot", chainOf = CHAIN) {
  const box = mount(
    <MemoryRouter>
      <RealmView realm={realm} chain={chainOf} home="/" options={{ fetch: fetcher }} />
    </MemoryRouter>,
  );
  // The page, the height and the chat's drawing arrive as promises: let them settle inside act.
  for (let turn = 0; turn < 40 && box.querySelector("[aria-busy]") !== null; turn += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }
  return box;
}

describe("a realm's view", () => {
  test("shows the realm's title, its page, the block height it was read at and the link to gnoweb", async () => {
    const box = await view(chain(WUGNOT?.body ?? null));
    expect(one(box, "#realm-title").textContent).toBe("gno.land/r/gnoland/wugnot");
    expect(box.textContent).toContain("wrapped GNOT ($wugnot)");
    expect(box.textContent).toContain("Total supply");
    expect(box.textContent).toMatch(
      /Read at block 786,661, 2026-10-30T23:43:10Z, from rpc\.onyx\.testnets\.gno\.land$/,
    );
    // 5i: the read functions' panel carries the link too, in every state; the page's own is the one outside it.
    const links = all(box, "a").filter(
      (a) =>
        a.getAttribute("href") === "https://onyx.testnets.gno.land/r/gnoland/wugnot" &&
        a.closest('[aria-label="Read functions"]') === null,
    );
    expect(links).toHaveLength(1);
  });

  test("asks the chain once for the page and once for the height, and nothing again", async () => {
    vi.useFakeTimers();
    const fetcher = chain(WUGNOT?.body ?? null);
    mount(
      <MemoryRouter>
        <RealmView realm="gno.land/r/gnoland/wugnot" chain={CHAIN} home="/" options={{ fetch: fetcher }} />
      </MemoryRouter>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    vi.useRealTimers();
    // 5i: the read functions' list is a third request (vm/qfuncs), asked once; no result is asked before a click.
    expect(fetcher).toHaveBeenCalledTimes(3);
    const urls = fetcher.mock.calls.map(([url]) => url);
    expect(urls.filter((url) => url.includes("/status"))).toHaveLength(1);
    expect(urls.filter((url) => url.includes("vm%2Fqrender"))).toHaveLength(1);
    expect(urls.filter((url) => url.includes("vm%2Fqfuncs"))).toHaveLength(1);
    expect(urls.filter((url) => url.includes("vm%2Fqeval"))).toHaveLength(0);
  });

  test("shows a page's form read only, and a link off gnoweb behind a button, whatever the realm wrote", async () => {
    const box = await view(chain(COINS?.body ?? null), "gno.land/r/gnoland/coins");
    expect(all(box, "form, input, textarea, select")).toHaveLength(0);
    expect(box.textContent).toContain("path: balances");
    expect(
      all(box, "a").some((a) => /^https:\/\/(?!onyx\.testnets\.gno\.land)/.test(a.getAttribute("href") ?? "")),
    ).toBe(false);
  });

  test("shows the cap's state, with the link and no part of the page, for a page past 256 KB", async () => {
    const box = await view(chain("# Big\n" + "x".repeat(300_000)));
    expect(box.textContent).toContain("This page is too large to show here (over 256 KB).");
    expect(box.textContent).not.toContain("Big");
    expect(all(box, "a").map((a) => a.getAttribute("href"))).toContain(
      "https://onyx.testnets.gno.land/r/gnoland/wugnot",
    );
  });

  test.each([
    ["a realm that is not on the chain", "/vm.InvalidPkgPathError", /This realm is not on this chain/],
    ["a realm with no page", "/vm.NoRenderDeclError", /This realm has no page to show/],
  ])("shows the failed read's state and its next step for %s, with the link to gnoweb", async (_name, type, next) => {
    const fetcher = vi.fn<ChainFetch>((url) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            url.includes("/status")
              ? statusEnvelope(1, "2026-10-30T23:43:10Z")
              : queryEnvelope({ data: null, error: { "@type": type } }),
          ),
        ),
      ),
    );
    const box = await view(fetcher);
    expect(one(box, '[role="alert"]').textContent).toMatch(next);
    expect(all(box, "a").map((a) => a.getAttribute("href"))).toContain(
      "https://onyx.testnets.gno.land/r/gnoland/wugnot",
    );
    expect(box.textContent).not.toContain("Read at block");
  });

  test("shows the failed state when the browser cannot reach the RPC at all (F2841), the link still there", async () => {
    const fetcher = vi.fn<ChainFetch>(() => Promise.reject(new TypeError("Failed to fetch")));
    const box = await view(fetcher);
    expect(one(box, '[role="alert"]').textContent).toMatch(/\S/);
    expect(all(box, "a").map((a) => a.getAttribute("href"))).toContain(
      "https://onyx.testnets.gno.land/r/gnoland/wugnot",
    );
  });

  test("shows the realm's read functions below its page, and a failed list leaves the page standing", async () => {
    const box = await view(chain(WUGNOT?.body ?? null));
    const functions = one(box, '[aria-label="Read functions"]');
    expect(follows(one(box, "#realm-title"), functions)).toBe(true);
    // This fetch answers vm/qfuncs with the page's text: the list is a state of its own, the page and the link stand.
    expect(box.textContent).toContain("wrapped GNOT ($wugnot)");
    expect(functions.querySelector('[role="status"]')).not.toBeNull();
    expect(all(functions, "a").map((a) => a.getAttribute("href"))).toContain(
      "https://onyx.testnets.gno.land/r/gnoland/wugnot",
    );
  });

  test("shows the read functions' state beside a page that could not be read", async () => {
    const box = await view(chain(null, { error: "down" }));
    expect(one(box, '[role="alert"]').textContent).toContain("could not be read");
    const functions = one(box, '[aria-label="Read functions"]');
    expect(one(functions, '[role="status"]').textContent).toMatch(/\S/);
    expect(all(functions, "a").map((a) => a.getAttribute("href"))).toContain(
      "https://onyx.testnets.gno.land/r/gnoland/wugnot",
    );
  });

  test("keeps the page when only the height fails, and says so", async () => {
    const box = await view(chain(WUGNOT?.body ?? null, { status: false }));
    expect(box.textContent).toContain("wrapped GNOT ($wugnot)");
    expect(box.textContent).toContain("The block height could not be read.");
  });

  test("names no gnoweb link for a chain whose gnoweb is not known, and still shows the page", async () => {
    const box = await view(chain(WUGNOT?.body ?? null), "gno.land/r/gnoland/wugnot", { ...CHAIN, chainId: "other-1" });
    expect(box.textContent).toContain("wrapped GNOT ($wugnot)");
    expect(all(box, "a")).toHaveLength(0);
  });

  // Back goes where the reader came from; opened by its address, with nothing behind it, to the universe's home.
  async function backFrom(entries: string[], index: number) {
    const fetcher = chain(WUGNOT?.body ?? null);
    const box = mount(
      <MemoryRouter initialEntries={entries} initialIndex={index}>
        <Routes>
          <Route
            path="/r/*"
            element={
              <RealmView realm="gno.land/r/gnoland/wugnot" chain={CHAIN} home="/home" options={{ fetch: fetcher }} />
            }
          />
          <Route path="*" element={<Here />} />
        </Routes>
      </MemoryRouter>,
    );
    click(button(box, "Back"));
    await act(async () => {
      await Promise.resolve();
    });
    return box.querySelector("[data-at]")?.textContent;
  }

  test("goes back to the universe's home when it was opened by its address", async () => {
    expect(await backFrom(["/r/gnoland/wugnot"], 0)).toBe("/home");
  });

  test("goes back to the page it came from when the reader came by the site", async () => {
    expect(await backFrom(["/w/bubble", "/r/gnoland/wugnot"], 1)).toBe("/w/bubble");
  });
});

function Here() {
  return <p data-at="">{useLocation().pathname}</p>;
}
