// @vitest-environment jsdom
import { realmType } from "@gnoworld/core";
import { queryEnvelope } from "@gnoworld/chain/testing/envelopes";
import type { ChainFetch } from "@gnoworld/chain/read";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { StoreProvider } from "../../storeContext.tsx";
import { all, button, click, follows, mount, one } from "../../../tests/mount.tsx";
import { RealmWrites } from "./RealmWrites.tsx";

// 9d, the call card's first place: a realm's write functions with one or two fields, each a "Call" row that opens the card
// under it, never a modal (frame 33). The read functions are the other panel's; more than two fields, a type a call does not
// carry and `<gno-form>` are 9e's. NOT recorded: the function list is written in the shape of vm/qfuncs.
const CHAIN = {
  name: "Onyx",
  chainId: "onyx-1",
  rpc: "https://rpc.onyx.testnets.gno.land:443",
  gnoweb: "https://onyx.testnets.gno.land",
  indexer: "https://indexer.onyx.testnets.gno.land/graphql/query",
};
const REALM = "gno.land/r/demo/profile";
const CUR = { Name: "cur", Type: realmType(), Value: "" };
const field = (Name: string, Type: string) => ({ Name, Type, Value: "" });
const FUNCTIONS = [
  { FuncName: "SetBio", Params: [CUR, field("bio", "string")], Results: null },
  { FuncName: "SetProfile", Params: [CUR, field("name", "string"), field("times", "int64")], Results: null },
  {
    FuncName: "SetThree",
    Params: [CUR, field("a", "string"), field("b", "string"), field("c", "string")],
    Results: null,
  },
  { FuncName: "Upload", Params: [CUR, field("data", "[]uint8")], Results: null },
  { FuncName: "Configure", Params: [CUR, field("settings", "map[string]string")], Results: null },
  { FuncName: "TotalSupply", Params: null, Results: [field(".res.0", "int64")] },
  { FuncName: "Render", Params: [field("path", "string")], Results: [field(".res.0", "string")] },
  { FuncName: "Foo.Bar", Params: [CUR, field("x", "string")], Results: null },
  // No field: a click that signs with nothing to fill is a quick action, 9e's (the brief says one or two fields).
  { FuncName: "Deposit", Params: [CUR], Results: null },
];
const chain = (functions: unknown = FUNCTIONS) =>
  vi.fn<ChainFetch>(() =>
    Promise.resolve(new Response(JSON.stringify(queryEnvelope({ data: JSON.stringify(functions) })))),
  );

async function panel(fetcher: ChainFetch = chain()) {
  const box = mount(
    <StoreProvider>
      <RealmWrites realm={REALM} chain={CHAIN} options={{ fetch: fetcher }} />
    </StoreProvider>,
  );
  await vi.waitFor(() => {
    expect(box.querySelector("[aria-busy]")).toBeNull();
  });
  return box;
}
const listed = (box: HTMLElement) =>
  all(box, "button").flatMap((b) => (b.textContent.startsWith("Call ") ? [b.textContent.slice(5)] : []));

describe("a realm's write functions, with the call card inline", () => {
  it("lists the write functions with one or two fields, each a Call button, and nothing else: no read, no 3 fields, no 0 fields, no type a call does not carry, no hostile name", async () => {
    expect(listed(await panel())).toEqual(["SetBio", "SetProfile"]);
  });

  it("lists nothing, and says so, for a realm with no such function", async () => {
    const box = await panel(chain([FUNCTIONS[5], FUNCTIONS[2], FUNCTIONS[8]]));
    expect(listed(box)).toEqual([]);
    expect(box.textContent).toContain("There is no write function to call here.");
  });

  it("is a region of its own, named, beside the read functions' and not inside them", async () => {
    const box = await panel();
    expect(one(box, '[aria-label="Write functions"]')).toBeDefined();
    expect(box.querySelector('[aria-label="Read functions"]')).toBeNull();
  });

  it("opens no card, asks Adena nothing and touches no wallet until a row's Call is clicked", async () => {
    const touched = vi.fn(() => undefined);
    Object.defineProperty(globalThis, "adena", { get: touched, configurable: true });
    try {
      const box = await panel();
      expect(all(box, "article")).toHaveLength(0);
      click(button(box, "Call SetBio"));
      expect(all(box, "article")).toHaveLength(1);
      expect(touched).not.toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(globalThis, "adena");
    }
  });

  it("opens the card under its own row, inline: after that row's button, before the next row, and no dialog", async () => {
    const box = await panel();
    const caller = button(box, "Call SetBio");
    click(caller);
    const rows = all(box, "li");
    const row = rows.find((li) => li.contains(caller ?? null));
    const card = one(box, "article");
    expect(row?.contains(card)).toBe(true);
    expect(caller && follows(caller, card)).toBe(true);
    expect(all(box, "dialog, [role=dialog], [aria-modal]")).toHaveLength(0);
    expect(card.textContent).toContain("SIGNATURE REQUEST · ADENA");
    expect(card.textContent).toContain("SetBio");
    expect(card.textContent).toContain(REALM);
    expect(card.textContent).toContain("onyx-1");
  });

  it("can have a card open under each of two rows, each its own", async () => {
    const box = await panel();
    click(button(box, "Call SetBio"));
    click(button(box, "Call SetProfile"));
    expect(all(box, "article")).toHaveLength(2);
    expect(all(box, "article").map((a) => a.getAttribute("aria-labelledby"))).not.toContain(null);
  });

  it("closes a card with its Cancel, and the row's Call opens a fresh one", async () => {
    const box = await panel();
    click(button(box, "Call SetBio"));
    click(button(one(box, "article"), "Cancel"));
    expect(all(box, "article")).toHaveLength(0);
    click(button(box, "Call SetBio"));
    expect(all(box, "article")).toHaveLength(1);
  });

  it("opens one card a row: a second click on Call does not add another", async () => {
    const box = await panel();
    click(button(box, "Call SetBio"));
    click(button(box, "Call SetBio"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(all(box, "article")).toHaveLength(1);
  });

  it("reads the indexer once for a card it opens: none before the click, none for what is typed, one more for a card opened again", async () => {
    const fetch = chain();
    const indexed = () => fetch.mock.calls.filter(([url]) => url.includes("indexer")).length;
    const box = await panel(fetch);
    expect(indexed()).toBe(0);
    click(button(box, "Call SetBio"));
    await vi.waitFor(() => {
      expect(indexed()).toBe(1);
    });
    const input = one(box, "article input") as HTMLInputElement;
    for (const text of ["h", "he", "hel"]) {
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, text);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }
    await act(async () => {
      await Promise.resolve();
    });
    expect(indexed()).toBe(1);
    click(button(one(box, "article"), "Cancel"));
    click(button(box, "Call SetBio"));
    await vi.waitFor(() => {
      expect(indexed()).toBe(2);
    });
  });

  it("shows the fee as an estimate from the indexer's rows, naming their block, and says Adena sets it when the indexer fails", async () => {
    const rows = [48000, 1000000, 52000].map((amount, i) => ({
      success: true,
      block_height: 100 + i,
      gas_fee: { amount, denom: "ugnot" },
      messages: [{ value: { pkg_path: REALM, func: "SetBio" } }],
    }));
    const fetch = vi.fn<ChainFetch>((url) =>
      url.includes("indexer")
        ? Promise.resolve(new Response(JSON.stringify({ data: { latestBlockHeight: 200, getTransactions: rows } })))
        : Promise.resolve(new Response(JSON.stringify(queryEnvelope({ data: JSON.stringify(FUNCTIONS) })))),
    );
    const box = await panel(fetch);
    click(button(box, "Call SetBio"));
    await vi.waitFor(() => {
      expect(one(box, "article").textContent).toContain("≈ 0.052 GNOT, an estimate from calls up to block 102");
    });
    const down = await panel(chain());
    click(button(down, "Call SetBio"));
    await vi.waitFor(() => {
      expect(one(down, "article").textContent).toContain("Set by Adena when you sign");
    });
  });

  it("shows a failed read of the list as a state with its next step, and no Call", async () => {
    const down = vi.fn<ChainFetch>(() => Promise.resolve(new Response("down", { status: 503 })));
    const box = await panel(down);
    expect(listed(box)).toEqual([]);
    expect(all(box, '[role="status"]').some((e) => e.textContent.trim() !== "")).toBe(true);
  });

  it("keeps a card on its own chain: the Onyx card does not appear under the same realm's row on gno.land, which has its own function (F5722)", async () => {
    const GNOLAND = { ...CHAIN, name: "gno.land", chainId: "gnoland-1", rpc: "https://rpc.gno.land:443" };
    const longer = [{ ...FUNCTIONS[0], Params: [CUR, field("bio", "string"), field("times", "int64")] }];
    const box = mount(
      <StoreProvider>
        <RealmWrites realm={REALM} chain={CHAIN} options={{ fetch: chain(FUNCTIONS) }} />
        <RealmWrites realm={REALM} chain={GNOLAND} options={{ fetch: chain(longer) }} />
      </StoreProvider>,
    );
    await vi.waitFor(() => {
      expect(box.querySelector("[aria-busy]")).toBeNull();
    });
    const [onyx = box, gno = box] = all(box, '[aria-label="Write functions"]');
    click(button(onyx, "Call SetBio"));
    expect(all(onyx, "article")).toHaveLength(1);
    expect(all(gno, "article")).toHaveLength(0);
    click(button(gno, "Call SetBio"));
    expect(all(gno, "article")).toHaveLength(1);
    expect(all(gno, "article input")).toHaveLength(2);
    expect(all(onyx, "article input")).toHaveLength(1);
  });
});
