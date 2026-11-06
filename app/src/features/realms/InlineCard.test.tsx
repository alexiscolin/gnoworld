// @vitest-environment jsdom
import { realmType } from "@gnoworld/core";
import type { ChainFetch } from "@gnoworld/chain/read";
import { act, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { StoreProvider, useAppStore } from "../../storeContext.tsx";
import { Grab, state } from "../../../tests/grabStore.tsx";
import { button, click, mount } from "../../../tests/mount.tsx";
import { CHAIN } from "../../../tests/callFixtures.ts";
import { callsIn } from "../calls/index.ts";
import { InlineCard, openCard, type CallPlace } from "./InlineCard.tsx";

// The call card as the realm view draws it (9e): nothing until it is opened, the fee read for the card's own function and again when
// its indexer changes, and a card's Try again done through the store. NOT recorded: the indexer's answers (the tests read requests).
const REALM = "gno.land/r/demo/profile";
const WRITE = {
  name: "SetBio",
  params: [
    { Name: "cur", Type: realmType() },
    { Name: "bio", Type: "string" },
  ],
};
const ID = `${CHAIN.chainId} ${REALM}.SetBio`;

const asked = () => vi.fn<ChainFetch>(() => Promise.resolve(new Response("{}", { status: 500 })));
const place = (fetcher: ChainFetch, indexer = CHAIN.indexer): CallPlace => ({
  realm: REALM,
  chain: { ...CHAIN, indexer },
  options: { fetch: fetcher },
});

function Opener({ where }: { where: CallPlace }) {
  const store = useAppStore();
  return (
    <button
      type="button"
      onClick={() => {
        openCard(store, { id: ID, place: where, write: WRITE });
      }}
    >
      Open
    </button>
  );
}
function Moving({ fetcher, other }: { fetcher: ChainFetch; other: string }) {
  const [indexer, setIndexer] = useState(CHAIN.indexer);
  return (
    <>
      {page(place(fetcher, indexer))}
      <button
        type="button"
        onClick={() => {
          setIndexer(other);
        }}
      >
        Move
      </button>
    </>
  );
}
const page = (where: CallPlace, opener: CallPlace = where) => (
  <StoreProvider>
    <Grab />
    <Opener where={opener} />
    <InlineCard id={ID} place={where} />
  </StoreProvider>
);

describe("the inline call card", () => {
  it("draws nothing and reads no fee for a card never opened, in a store that has no calls at all", () => {
    const fetcher = asked();
    const box = mount(page(place(fetcher)));
    expect(box.querySelector("article")).toBeNull();
    expect(callsIn(state())).toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reads the fees of the card's own function once it is opened, and again from the new indexer when the place changes", async () => {
    const fetcher = asked();
    const other = "https://other.example/graphql/query";
    const box = mount(<Moving fetcher={fetcher} other={other} />);
    click(button(box, "Open"));
    await vi.waitFor(() => {
      expect(fetcher).toHaveBeenCalled();
    });
    const urls = () => fetcher.mock.calls.map(([url]) => url);
    expect(urls().every((url) => url.startsWith(CHAIN.indexer))).toBe(true);
    click(button(box, "Move"));
    await vi.waitFor(() => {
      expect(urls().some((url) => url.startsWith(other))).toBe(true);
    });
  });

  it("offers Try again on a failed card that nothing was sent for, and the card is back to its fields", () => {
    const box = mount(page(place(asked())));
    click(button(box, "Open"));
    act(() => {
      callsIn(state())?.callsActions.failed(ID, { reason: "missing" });
    });
    click(button(box, "Try again"));
    expect(callsIn(state())?.calls[ID]?.state.kind).toBe("preview");
  });
});
