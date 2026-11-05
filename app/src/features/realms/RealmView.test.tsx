// @vitest-environment jsdom
import { act } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { PAGES } from "../../../tests/chain/chainFixture.ts";
import { queryEnvelope, rpcErrorEnvelope, statusEnvelope } from "@gnoworld/chain/testing/envelopes";
import { all, button, click, follows, mount, one } from "../../../tests/mount.tsx";
import type { ChainFetch } from "@gnoworld/chain/read";
import { realmType } from "@gnoworld/core";
import { StoreProvider } from "../../storeContext.tsx";
import { RealmView } from "./RealmView.tsx";

// 5h: a realm's view reads its page and the block height once through lib/chain, and shows what it read, the cap's state or the
// failed read's state, each with the link to the realm on gnoweb. The answers are the recorded ones (chainFixture.ts: PAGES).
const COINS = PAGES.find((row) => row.realm === "gno.land/r/gnoland/coins");
const WUGNOT = PAGES[1];
const CHAIN = {
  name: "Onyx",
  chainId: "onyx-1",
  rpc: "https://rpc.onyx.testnets.gno.land:443",
  gnoweb: "https://onyx.testnets.gno.land",
  indexer: "https://indexer.onyx.testnets.gno.land/graphql/query",
};
// The input fields under `box`, as the inputs they are.
const inputs = (box: ParentNode): HTMLInputElement[] => [...box.querySelectorAll("input")];

// 5k: the facts the indexer gives for the realm, in the shape the schema takes (synthetic: nothing is recorded, F2950).
const FACTS = {
  path: "gno.land/r/gnoland/wugnot",
  deployer: "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5",
  firstBlock: 12,
};

// A fetch that answers /status with a height, the indexer with `facts` (or as `indexer` says) and any query with `page`; or
// fails as `fail` says.
function chain(
  page: string | null,
  { status = true, error, indexer = "facts" }: { status?: boolean; error?: string; indexer?: "facts" | "down" } = {},
) {
  return vi.fn<ChainFetch>((url) => {
    if (url.startsWith("https://indexer.")) {
      return Promise.resolve(
        indexer === "down"
          ? new Response("down", { status: 503 })
          : new Response(JSON.stringify({ data: { realmFacts: FACTS } })),
      );
    }
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
    <StoreProvider>
      <MemoryRouter>
        <RealmView realm={realm} chain={chainOf} home="/" options={{ fetch: fetcher }} />
      </MemoryRouter>
    </StoreProvider>,
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
    // The line is the last of the page itself; the read functions' panel, with its own text, follows it (5i).
    expect(
      all(box, "p").some((p) =>
        /^Read at block 786,661, 2026-10-30T23:43:10Z, from rpc\.onyx\.testnets\.gno\.land$/.test(p.textContent),
      ),
    ).toBe(true);
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
      <StoreProvider>
        <MemoryRouter>
          <RealmView realm="gno.land/r/gnoland/wugnot" chain={CHAIN} home="/" options={{ fetch: fetcher }} />
        </MemoryRouter>
      </StoreProvider>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    vi.useRealTimers();
    // 5i: the read functions' list is a third request (vm/qfuncs), asked once; no result is asked before a click. 5k: the indexer
    // is a fourth, to its own address, asked once.
    expect(fetcher).toHaveBeenCalledTimes(4);
    const urls = fetcher.mock.calls.map(([url]) => url);
    expect(urls.filter((url) => url.startsWith("https://indexer.onyx.testnets.gno.land/graphql/query?"))).toHaveLength(
      1,
    );
    expect(urls.filter((url) => url.includes("/status"))).toHaveLength(1);
    expect(urls.filter((url) => url.includes("vm%2Fqrender"))).toHaveLength(1);
    expect(urls.filter((url) => url.includes("vm%2Fqfuncs"))).toHaveLength(1);
    expect(urls.filter((url) => url.includes("vm%2Fqeval"))).toHaveLength(0);
  });

  test("shows the realm's facts from the indexer with their source and time, and asks for the realm's own path", async () => {
    const fetcher = chain(WUGNOT?.body ?? null);
    const box = await view(fetcher);
    const facts = one(box, '[aria-label="Facts from the indexer"]');
    expect(facts.textContent).toContain("gno.land/r/gnoland/wugnot");
    expect(facts.textContent).toContain("Read from indexer.onyx.testnets.gno.land at ");
    const asked = fetcher.mock.calls.map(([url]) => url).find((url) => url.startsWith("https://indexer."));
    expect(decodeURIComponent(asked ?? "")).toContain('"path":"gno.land/r/gnoland/wugnot"');
  });

  test("shows a state with its next step when the indexer is down, and the page and its height stand", async () => {
    const box = await view(chain(WUGNOT?.body ?? null, { indexer: "down" }));
    expect(box.querySelector('[aria-label="Facts from the indexer"]')).toBeNull();
    const state = all(box, '[role="status"]').find((el) => el.textContent.includes("Read from indexer."));
    expect(state?.textContent).toMatch(/did not answer/);
    expect(box.textContent).toContain("wrapped GNOT ($wugnot)");
    expect(box.textContent).toContain("Read at block 786,661");
    // The facts' failure does not take the page's alert.
    expect(box.querySelector('[role="alert"]')).toBeNull();
  });

  test("shows the facts while the page could not be read, each read on its own", async () => {
    const box = await view(chain(null, { error: "down" }));
    expect(one(box, '[role="alert"]').textContent).toContain("could not be read");
    expect(one(box, '[aria-label="Facts from the indexer"]').textContent).toContain("gno.land/r/gnoland/wugnot");
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
    // After "Read at block", which stays beside the page it dates, not parted from it by up to a hundred buttons.
    const read = all(box, "p").find((p) => p.textContent.startsWith("Read at block"));
    expect(read !== undefined && follows(read, functions)).toBe(true);
    // This fetch answers vm/qfuncs with the page's text: the list is a state of its own, the page and the link stand.
    expect(box.textContent).toContain("wrapped GNOT ($wugnot)");
    expect(functions.querySelector('[role="status"]')).not.toBeNull();
    expect(all(functions, "a").map((a) => a.getAttribute("href"))).toContain(
      "https://onyx.testnets.gno.land/r/gnoland/wugnot$help",
    );
  });

  test("shows the read functions' state beside a page that could not be read", async () => {
    const box = await view(chain(null, { error: "down" }));
    expect(one(box, '[role="alert"]').textContent).toContain("could not be read");
    const functions = one(box, '[aria-label="Read functions"]');
    expect(one(functions, '[role="status"]').textContent).toMatch(/\S/);
    expect(all(functions, "a").map((a) => a.getAttribute("href"))).toContain(
      "https://onyx.testnets.gno.land/r/gnoland/wugnot$help",
    );
  });

  test("keeps the page when only the height fails, and says so", async () => {
    const box = await view(chain(WUGNOT?.body ?? null, { status: false }));
    expect(box.textContent).toContain("wrapped GNOT ($wugnot)");
    expect(box.textContent).toContain("The block height could not be read.");
  });

  // R-F3 (F2906, F2952): the two addresses are the chain's own, read from the data it is given, never from a table by chain id.
  test("links gnoweb and asks the indexer where the chain's data says, whatever the chain's id", async () => {
    const fetcher = chain(WUGNOT?.body ?? null);
    const other = {
      ...CHAIN,
      chainId: "other-1",
      gnoweb: "https://gnoweb.other.example",
      indexer: "https://indexer.other.example/graphql/query",
    };
    const box = await view(fetcher, "gno.land/r/gnoland/wugnot", other);
    expect(all(box, "a").map((link) => link.getAttribute("href"))).toContain(
      "https://gnoweb.other.example/r/gnoland/wugnot",
    );
    expect(fetcher.mock.calls.some(([url]) => url.startsWith("https://indexer.other.example/graphql/query?"))).toBe(
      true,
    );
    expect(fetcher.mock.calls.some(([url]) => url.includes("onyx.testnets.gno.land/graphql"))).toBe(false);
  });

  test("names no gnoweb link when the data's gnoweb is no https origin, and still shows the page", async () => {
    const fetcher = chain(WUGNOT?.body ?? null);
    const box = await view(fetcher, "gno.land/r/gnoland/wugnot", { ...CHAIN, gnoweb: "http://gnoweb.other.example" });
    expect(box.textContent).toContain("wrapped GNOT ($wugnot)");
    expect(all(box, "a")).toHaveLength(0);
  });

  // Back goes where the reader came from; opened by its address, with nothing behind it, to the universe's home.
  async function backFrom(entries: string[], index: number) {
    const fetcher = chain(WUGNOT?.body ?? null);
    const box = mount(
      <StoreProvider>
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
        </MemoryRouter>
      </StoreProvider>,
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

// 9e: a page's form gets its Call in the realm's own view, where the realm and the chain are known; the view passes them on.
describe("a realm's view, with a form on its page", () => {
  const CUR = { Name: "cur", Type: realmType() };
  const WRITES = [{ FuncName: "SetBio", Params: [CUR, { Name: "bio", Type: "string" }], Results: null }];
  const form = (exec: string) =>
    `# Bio\n\n<gno-form exec="${exec}">\n<gno-input name="bio" type="text" value="hi" />\n</gno-form>`;
  const fetcher = (page: string) =>
    vi.fn<ChainFetch>((url) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            url.includes("/status")
              ? statusEnvelope(786661, "2026-10-30T23:43:10Z")
              : queryEnvelope({ data: url.includes("vm%2Fqfuncs") ? JSON.stringify(WRITES) : page }),
          ),
        ),
      ),
    );
  const callOf = (box: HTMLElement) =>
    vi.waitFor(() => {
      const found = button(one(box, "figure"), "Call SetBio");
      if (found === undefined) throw new Error("no Call yet");
      return found;
    });

  test("shows a Call on a page's form for a write function the chain lists, and opens its card prefilled in the view", async () => {
    const box = await view(fetcher(form("SetBio")));
    click(await callOf(box));
    expect(inputs(one(box, "figure")).map((i) => i.value)).toEqual(["hi"]);
  });

  test("keeps the form read only for a function the chain does not list", async () => {
    const box = await view(fetcher(form("Drain")));
    // The write rows below the page are drawn from the same list: the form had its answer by then.
    await vi.waitFor(() => {
      expect(button(box, "Call SetBio")).toBeDefined();
    });
    expect(all(one(box, "figure"), "button")).toHaveLength(0);
    expect(one(box, "figure").textContent).toContain("read only");
  });

  test("gives the form and the write row of one function a card each, with the form's own texts", async () => {
    const box = await view(fetcher(form("SetBio")));
    const formCall = await callOf(box);
    click(all(box, '[aria-label="Write functions"] button').find((b) => b.textContent === "Call SetBio"));
    click(formCall);
    expect(inputs(one(box, "figure")).map((i) => i.value)).toEqual(["hi"]);
    expect(all(box, "article")).toHaveLength(2);
  });
});
