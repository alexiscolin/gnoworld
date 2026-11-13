// The link cards' slice of the store (link-previews L4): each line's card key, by room and msgid, from the server's `card` events and from
// its answer for lines older than the stream's replay. A card exists only after one of them said so; a removal is kept, so no answer asked
// before it brings the card back. It joins the page's store with the first card, as the calls' slice does (features/calls/slice.ts), and is
// kept out of store/: the first screen's budget has no room for it.
import type { CardEvent } from "@gnoworld/schemas";
import type { StoreApi } from "zustand/vanilla";
import { trimOldest } from "@gnoworld/core";
import { LINES_KEPT } from "../../store/chat.ts";
import { sessionChanged, type AppState } from "../../store/index.ts";
import { own } from "../../store/record.ts";
import { cardsIn, type CardsSlice } from "./cardsIn.ts";

/** A room's newest cards kept, its window's lines twice over, so a long session holds no more. */
export const CARDS_KEPT = 2 * LINES_KEPT;
// The removals remembered: an answer asked before a removal and given after it must not bring its card back.
const GONE_KEPT = 500;

interface Copy {
  held: Map<string, string>;
  order: string[];
}

// A room's cards and their order, to change apart from the store's.
const copyOf = (cards: CardsSlice["cards"], order: CardsSlice["cardsOrder"], room: string): Copy => ({
  held: new Map(Object.entries(own(cards, room) ?? {})),
  order: [...(own(order, room) ?? [])],
});

// A card set on a line, unless a removal came first or an answer meets one an event gave; whether it changed the copy.
function put(copy: Copy, [msgid, key]: readonly [string, string], replace: boolean): boolean {
  const held = copy.held.get(msgid);
  if (held === key || (held !== undefined && !replace)) return false;
  if (held === undefined) copy.order.push(msgid);
  copy.held.set(msgid, key);
  return true;
}

// A card taken from a line; whether it held one.
function drop(copy: Copy, msgid: string): boolean {
  if (!copy.held.delete(msgid)) return false;
  copy.order = copy.order.filter((each) => each !== msgid);
  return true;
}

// The removals remembered, the oldest forgotten first.
function remember(gone: Set<string>, id: string): void {
  gone.add(id);
  trimOldest(gone, GONE_KEPT);
}

function slice({ setState: set, getState: get }: StoreApi<AppState & CardsSlice>): void {
  const gone = new Set<string>();
  const take = (events: readonly CardEvent[], told: boolean): void => {
    const { cards, cardsOrder } = get();
    const rooms = new Map<string, Copy>();
    let changed = false;
    for (const { room, msgid, key } of events) {
      const id = `${room} ${msgid}`;
      const copy = rooms.get(room) ?? copyOf(cards, cardsOrder, room);
      rooms.set(room, copy);
      if (key === null) remember(gone, id);
      const did = key === null ? drop(copy, msgid) : !gone.has(id) && put(copy, [msgid, key], told);
      changed ||= did;
    }
    if (!changed) return;
    const next = { cards: { ...cards }, cardsOrder: { ...cardsOrder } };
    // As own entries, whatever the room's name.
    const as = { enumerable: true, writable: true, configurable: true };
    for (const [room, { held, order }] of rooms) {
      for (const old of order.slice(0, -CARDS_KEPT)) held.delete(old);
      Object.defineProperty(next.cards, room, { ...as, value: Object.fromEntries(held) });
      Object.defineProperty(next.cardsOrder, room, { ...as, value: order.slice(-CARDS_KEPT) });
    }
    set(next);
  };
  set({
    cards: {},
    cardsOrder: {},
    cardActions: {
      told: (events) => {
        take(events, true);
      },
      asked: (events) => {
        take(events, false);
      },
      forget: () => {
        gone.clear();
        if (Object.keys(get().cards).length > 0) set({ cards: {}, cardsOrder: {} });
      },
    },
  });
}

/** Adds the slice to the page's store, once, and gives its actions. A session that follows another leaves none of the last one's cards. */
export function addCards(store: StoreApi<AppState>): CardsSlice["cardActions"] {
  const held = cardsIn(store.getState());
  if (held !== undefined) return held.cardActions;
  // The slice is added right here, so this is the one place that holds the store as having it.
  const cards = store as StoreApi<AppState & CardsSlice>;
  slice(cards);
  cards.subscribe((state, before) => {
    if (sessionChanged(state, before)) state.cardActions.forget();
  });
  return cards.getState().cardActions;
}
