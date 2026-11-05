// The call card as the realm view draws it (9d, 9e): under the thing that opened it, in the thread and never in a modal. The write rows,
// a page's form and a proposed action share it: the fee read once when it opens, its words from the course the store holds.
import { readCallFees, type CallFees } from "@gnoworld/chain/fees";
import type { ReadOptions } from "@gnoworld/chain/read";
import { useEffect, useState } from "react";
import type { StoreApi } from "zustand/vanilla";
import { CallCard, callsIn, ensureCalls, feeText, signInPage } from "../calls/index.ts";
import type { CallCard as CallCardState } from "../../lib/calls.ts";
import type { AppState } from "../../store/index.ts";
import { useApp, useAppStore } from "../../storeContext.tsx";
import type { Callable } from "./useCallable.ts";

/** What a card is opened on: the realm, and the chain it is read from and signed on. */
export interface CallPlace {
  realm: string;
  chain: { name: string; chainId: string; rpc: string; indexer: string };
  options?: ReadOptions | undefined;
}

// A rejection here is a bug, not a state: the browser's own report, as the other panels' are.
const report = (error: unknown): void => {
  reportError(error);
};

/** Opens the card `id` for `write` with `texts` in its fields, each through the card's own edit: a text no field takes is a problem
 * the card shows, never a signature. A card of that id already open is left as it is. */
export function openCard(
  store: StoreApi<AppState>,
  card: { id: string; place: CallPlace; write: Callable; texts?: readonly string[] },
): void {
  const { callsActions, calls } = ensureCalls(store).getState();
  const { id, place, write } = card;
  // A card already open keeps what the person typed in it: the texts are the opening's, not the Call's every time.
  const wasOpen = calls[id] !== undefined;
  callsActions.open({ id, chainId: place.chain.chainId, realm: place.realm, func: write.name, params: write.params });
  if (wasOpen) return;
  (card.texts ?? []).forEach((text, index) => {
    if (text !== "") callsActions.edit(id, index, text);
  });
}

/** The card `id`, once opened: nothing before. */
export function InlineCard({ id, place }: { id: string; place: CallPlace }) {
  const card = useApp((state) => callsIn(state)?.calls[id]);
  return card === undefined ? null : <OpenCard card={card} place={place} />;
}

function OpenCard({ card, place }: { card: CallCardState; place: CallPlace }) {
  const store = useAppStore();
  const [fees, setFees] = useState<CallFees | undefined>(undefined);
  const { id, realm, func } = card;
  const { chain, options } = place;
  useEffect(() => {
    readCallFees(chain.indexer, { realm, func }, options)
      .then((read) => {
        setFees(read.ok ? read.value : undefined);
      })
      .catch(report);
  }, [chain.indexer, realm, func, options]);
  const { callsActions } = ensureCalls(store).getState();
  const { name, chainId, rpc } = chain;
  return (
    <CallCard
      card={card}
      network={{ name, chainId }}
      fee={feeText(fees)}
      onEdit={(index, text) => {
        callsActions.edit(id, index, text);
      }}
      onSign={() => {
        signInPage(id, store, { chainId, name, rpc }).catch(report);
      }}
      onCancel={() => {
        callsActions.close(id);
      }}
      onRetry={() => {
        callsActions.retry(id);
      }}
    />
  );
}
