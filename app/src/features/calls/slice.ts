// The call cards' slice of the store (9d): its actions move a card only along the course, preview, signing, landing, done, so nothing is
// done before the chain has answered (ADR-0002 section 4). It joins the page's store when a realm view draws its first card, and is
// kept out of store/, whose files vite.config.ts puts in the first screen's chunk: the first screen's budget has no room for it.
import type { StoreApi } from "zustand/vanilla";
import type { CallCard, CallsSlice, CardState } from "../../lib/calls.ts";
import type { AppState } from "../../store/index.ts";
import { without } from "../../store/record.ts";

/** A store that has the calls' slice. */
export type CallsStore = StoreApi<AppState & CallsSlice>;

/** The state with the calls' slice, or nothing before a card was drawn: the one way to read it (F5726). */
export function callsIn(state: AppState): (AppState & CallsSlice) | undefined {
  return Object.hasOwn(state, "callsActions") ? (state as AppState & CallsSlice) : undefined;
}

// Puts the slice in the store; `store` is its type only until this has run.
function addCalls({ setState: set, getState: get }: CallsStore): void {
  // A card changed when it is in one of the states `from`, and `change` gives a change.
  const go = (
    id: string,
    from: readonly CardState["kind"][],
    change: (card: CallCard) => Partial<CallCard> | undefined,
  ) => {
    const card = get().calls[id];
    const changed = card !== undefined && from.includes(card.state.kind) ? change(card) : undefined;
    if (card !== undefined && changed !== undefined) set({ calls: { ...get().calls, [id]: { ...card, ...changed } } });
  };
  const to = (id: string, from: CardState["kind"], state: CardState) => {
    go(id, [from], () => ({ state }));
  };
  set({
    calls: {},
    callsActions: {
      open: ({ id, chainId, realm, func, params }) => {
        const texts = params.slice(1).map(() => "");
        if (get().calls[id] === undefined)
          set({
            calls: { ...get().calls, [id]: { id, chainId, realm, func, params, texts, state: { kind: "preview" } } },
          });
      },
      edit: (id, index, text) => {
        go(id, ["preview"], ({ texts }) =>
          texts[index] === undefined || texts[index] === text ? undefined : { texts: texts.with(index, text) },
        );
      },
      signing: (id) => {
        to(id, "preview", { kind: "signing" });
      },
      landing: (id, hash) => {
        to(id, "signing", { kind: "landing", hash });
      },
      done: (id, { height, value }) => {
        go(id, ["landing"], ({ state }) =>
          state.kind === "landing" && Number.isSafeInteger(height) && height > 0
            ? { state: { kind: "done", hash: state.hash, height, value } }
            : undefined,
        );
      },
      failed: (id, failure) => {
        go(id, ["preview", "signing", "landing"], () => ({ state: { kind: "failed", ...failure } }));
      },
      retry: (id) => {
        go(id, ["failed"], ({ state }) =>
          state.kind === "failed" && state.hash === undefined && state.reason !== "maybe-sent"
            ? { state: { kind: "preview" } }
            : undefined,
        );
      },
      close: (id) => {
        const kind = get().calls[id]?.state.kind;
        if (kind !== undefined && kind !== "signing" && kind !== "landing") set({ calls: without(get().calls, id) });
      },
    },
  });
}

/** Adds the slice to the page's store, once (a store that has it is left as it is), and gives the store as one that has it. */
export function ensureCalls(store: StoreApi<AppState>): CallsStore {
  // The slice is added right here, so this is the one place that holds the store as having it.
  const calls = store as CallsStore;
  if (callsIn(store.getState()) === undefined) addCalls(calls);
  return calls;
}
