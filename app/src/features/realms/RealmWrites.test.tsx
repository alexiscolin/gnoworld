// @vitest-environment jsdom
import { realmType } from "@gnoworld/core";
import { queryEnvelope, statusEnvelope } from "@gnoworld/chain/testing/envelopes";
import type { ChainFetch } from "@gnoworld/chain/read";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { StoreProvider } from "../../storeContext.tsx";
import { Grab, state } from "../../../tests/grabStore.tsx";
import { Address } from "@gnoworld/schemas";
import { all, button, click, follows, mount, one } from "../../../tests/mount.tsx";
import { typed } from "../../../tests/callFixtures.ts";
import { recordedAdena } from "../../../tests/recordedAdena.ts";
import { RealmWrites } from "./RealmWrites.tsx";

// 9d, widened by 9e: every write function a call can carry is a "Call" row that opens the card under it, never a modal (frame
// 33): any count of fields, none too (D254); a type a call does not carry gets a way to gnoweb. NOT recorded: the function list is
// written in the shape of vm/qfuncs.
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
  // No field: a click that signs with nothing to fill (D254, 9e).
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
  // 9e changes this test (it said "no 3 fields, no 0 fields"): the card is for every write a call can carry.
  it("lists every write function a call can carry, each a Call button: three fields and none too, and no read, no type a call does not carry, no hostile name", async () => {
    expect(listed(await panel())).toEqual(["SetBio", "SetProfile", "SetThree", "Deposit"]);
  });

  it("opens a call of three fields in the realm view: its card under its own row, a field each, never a dialog (9e)", async () => {
    const box = await panel();
    const caller = button(box, "Call SetThree");
    click(caller);
    const card = one(box, "article");
    expect(
      all(box, "li")
        .find((li) => li.contains(caller ?? null))
        ?.contains(card),
    ).toBe(true);
    expect(all(card, "input")).toHaveLength(3);
    for (const name of ["a", "b", "c"])
      expect(all(card, "label").some((l) => l.textContent.startsWith(name))).toBe(true);
    expect(all(box, "dialog, [role=dialog], [aria-modal]")).toHaveLength(0);
  });

  it("opens a write with no field as a card with nothing to fill and a Sign button that is enabled, and asks Adena nothing yet (D254)", async () => {
    const touched = vi.fn(() => undefined);
    Object.defineProperty(globalThis, "adena", { get: touched, configurable: true });
    try {
      const box = await panel();
      click(button(box, "Call Deposit"));
      const card = one(box, "article");
      expect(all(card, "input, textarea")).toHaveLength(0);
      expect(card.textContent).toContain("Deposit");
      expect(button(card, "Sign in Adena")?.hasAttribute("disabled")).toBe(false);
      expect(touched).not.toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(globalThis, "adena");
    }
  });

  it("gives a function with a type a call does not carry no Call, and a link to the realm on gnoweb in its row, never a hidden one (9e)", async () => {
    const box = await panel();
    for (const name of ["Upload", "Configure"]) {
      const row = all(box, "li").find((li) => li.textContent.includes(name));
      expect(row, name).toBeDefined();
      expect(row ? all(row, "button") : []).toHaveLength(0);
      const link = row?.querySelector("a");
      expect(link?.textContent).toContain("Open in gnoweb");
      expect(link?.getAttribute("href")).toBe(`${CHAIN.gnoweb}/r/demo/profile`);
      // The realm view's own "Open it on gnoweb" is the same Button href: a plain anchor, which opens in no other window.
      expect(link?.getAttribute("target")).toBeNull();
    }
    expect(all(box, "li").some((li) => li.textContent.includes("Foo.Bar"))).toBe(false);
    expect(all(box, "li").some((li) => li.textContent.includes("TotalSupply"))).toBe(false);
  });

  it("lists a realm of functions no call carries as rows with their way to gnoweb, and does not say there is none to call", async () => {
    const box = await panel(chain([FUNCTIONS[3], FUNCTIONS[4]]));
    expect(listed(box)).toEqual([]);
    expect(all(box, "li")).toHaveLength(2);
    expect(all(box, "li a")).toHaveLength(2);
    expect(box.textContent).not.toContain("There is no write function to call here.");
  });

  it("lists nothing, and says so, for a realm with no write function", async () => {
    const box = await panel(chain([FUNCTIONS[5], FUNCTIONS[6]]));
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

  // The rows are the frame's (F5741 to F5744): an outlined small pill, the name in mono and muted on the pill's line. The stylesheet
  // is read as empty here, so the rules (the hairlines, the step) are the Mac Studio's pictures.
  it("draws each row's Call as a small outlined pill, and its name as its own mono, muted part on the pill's line (F5741, F5742, F5743)", async () => {
    const box = await panel();
    const call = button(box, "Call SetBio");
    expect(call?.dataset["emphasis"]).toBe("outline");
    expect(call?.dataset["size"]).toBe("s");
    const name = all(box, "li span").find((s) => s.textContent === "SetBio");
    expect(name?.className).toContain("name");
    expect(name?.parentElement?.className).toContain("line");
    expect(name?.parentElement?.contains(call ?? null)).toBe(true);
  });
});

// GovDAO's vote (frames 28 to 33): the realm card's Call on the vote function, then the card. Nothing shows as voted before the
// chain's own answer; the course holds that (9d), here the vote's card must keep to it. NOT recorded: written in qfuncs' shape.
describe("a vote on GovDAO", () => {
  const ME = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
  // tm2's ResultTx for the recording's hash, a call that landed at block 55414 (written from the source, as chain's tx.test is).
  const TX = {
    jsonrpc: "2.0",
    id: "",
    result: {
      hash: "eFwYnlgr7KfDvMsmr6ntZ5vCoe/JcHLddE0pzi+D0Fg=",
      height: "55414",
      index: 0,
      tx_result: {
        ResponseBase: { Error: null, Data: null, Events: null, Log: "ok", Info: "" },
        GasWanted: "1",
        GasUsed: "1",
      },
      tx: "AA==",
    },
  };
  const DAO = "gno.land/r/gov/dao";
  const VOTE = {
    FuncName: "MustVoteOnProposalSimple",
    Params: [CUR, field("pid", "int64"), field("option", "string")],
    Results: null,
  };
  async function dao() {
    const box = mount(
      <StoreProvider>
        <Grab />
        <RealmWrites realm={DAO} chain={CHAIN} options={{ fetch: chain([VOTE]) }} />
      </StoreProvider>,
    );
    await vi.waitFor(() => {
      expect(box.querySelector("[aria-busy]")).toBeNull();
    });
    return box;
  }

  it("lists the vote function with a Call, and its card asks the proposal and the option, naming the realm and the function", async () => {
    const box = await dao();
    click(button(box, "Call MustVoteOnProposalSimple"));
    const card = one(box, "article");
    expect(all(card, "input")).toHaveLength(2);
    expect(card.textContent).toContain(DAO);
    expect(card.textContent).toContain("MustVoteOnProposalSimple");
  });

  it("shows the vote as voted only once the chain has answered, never when Adena has signed", async () => {
    const box = await dao();
    act(() => {
      state().loginActions.signedIn(ME);
    });
    // Adena signs at once; the chain's tx read is held, so the card can be seen between the two.
    const held = Promise.withResolvers<Response>();
    vi.stubGlobal("fetch", (url: string) =>
      url.includes("/status")
        ? Promise.resolve(new Response(JSON.stringify(statusEnvelope(55420, "2026-11-05T05:00:00Z", "onyx-1"))))
        : held.promise,
    );
    Object.defineProperty(globalThis, "adena", { value: recordedAdena({ account: ME }).adena, configurable: true });
    try {
      click(button(box, "Call MustVoteOnProposalSimple"));
      const [pid, option] = all(one(box, "article"), "input") as HTMLInputElement[];
      typed(pid, "15");
      typed(option, "YES");
      click(button(one(box, "article"), "Sign in Adena"));
      await vi.waitFor(() => {
        expect(one(box, "article").textContent).toContain("Landing in a block");
      });
      expect(one(box, "article").textContent).not.toMatch(/signed ·|voted/i);
      await act(async () => {
        held.resolve(new Response(JSON.stringify(TX)));
        await Promise.resolve();
      });
      await vi.waitFor(() => {
        expect(one(box, "article").textContent).toContain("Signed ·");
      });
    } finally {
      vi.unstubAllGlobals();
      Reflect.deleteProperty(globalThis, "adena");
    }
  });
});
