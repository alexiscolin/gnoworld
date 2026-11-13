// The reading places the page forwards to the server for each world's unread count: only the ones Ergo echoed (the store's `read`, which
// only an echo sets), a room's alone, each at most once, batched to one call every 5 s; a call that failed is sent again with the next place.
import { RoomId, UNREAD_PLACES_MOST, type UnreadPlaces } from "@gnoworld/schemas";
import type { createAppStore } from "../../store/index.ts";

type Place = UnreadPlaces["places"][number];

/** Forwards the store's places through `send` (true once the server took them), those it holds now first; returns the stop. */
export function forwardPlaces(
  store: ReturnType<typeof createAppStore>,
  send: (places: Place[]) => Promise<boolean>,
  { everyMs }: { everyMs: number },
): () => void {
  const sent = new Map<string, string>();
  let last = Number.NEGATIVE_INFINITY;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const pending = (): Place[] =>
    Object.entries(store.getState().chat.rooms)
      .flatMap(([room, { read }]) =>
        read !== undefined && RoomId.safeParse(room).success && sent.get(room) !== read ? [{ room, time: read }] : [],
      )
      .slice(0, UNREAD_PLACES_MOST);

  const flush = (): void => {
    timer = undefined;
    const places = pending();
    if (stopped || places.length === 0) return;
    last = Date.now();
    for (const { room, time } of places) sent.set(room, time);
    const forget = (): void => {
      for (const { room } of places) sent.delete(room);
    };
    send(places).then((took) => {
      if (!took) forget();
    }, forget);
  };

  // The rooms read at the last change: a change of another slice of the store leaves them, and asks nothing.
  let seen: unknown;
  const schedule = (): void => {
    const { rooms } = store.getState().chat;
    if (rooms === seen) return;
    seen = rooms;
    if (timer !== undefined || stopped || pending().length === 0) return;
    timer = setTimeout(flush, Math.max(0, last + everyMs - Date.now()));
  };

  const unsubscribe = store.subscribe(schedule);
  schedule();
  return () => {
    stopped = true;
    unsubscribe();
    clearTimeout(timer);
  };
}
