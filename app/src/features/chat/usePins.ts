// The shown room's pins, followed and asked for the reader (slice 4's 4d): the asker (askPins.ts) is made once the page
// runs, asks the server as the room is shown and each minute while the page shows, and is asked again as the tab
// shows. A guest's pins are read too (the room's pins are public to whoever may read it).
import { useEffect, useRef } from "react";
import { pagePinsApi } from "../../lib/api/pins.ts";
import type { createAppStore } from "../../store/index.ts";
import { pinAsker, type Done } from "./askPins.ts";

type Store = ReturnType<typeof createAppStore>;

/** The pin and the unpin of a line of the shown room, which say whether the server took them. */
export interface Pinning {
  pin: (msgid: string) => Promise<Done>;
  unpin: (msgid: string) => Promise<Done>;
}

/** Asks for the room's pins as it is shown, and gives the way to pin and unpin in it. */
export function usePins(store: Store, room: string | undefined, reader: string | undefined): Pinning {
  const askerRef = useRef<ReturnType<typeof pinAsker>>(undefined);
  useEffect(() => {
    const api = pagePinsApi();
    const asker = pinAsker({
      ...api,
      set: store.getState().pinsActions.set,
      visible: () => document.visibilityState === "visible",
    });
    const shows = () => {
      asker.refresh();
    };
    document.addEventListener("visibilitychange", shows);
    askerRef.current = asker;
    return () => {
      document.removeEventListener("visibilitychange", shows);
      asker.stop();
    };
  }, [store]);
  useEffect(() => {
    askerRef.current?.show(room, reader);
  }, [room, reader]);
  const refused = Promise.resolve<Done>({ ok: false, reason: "refused" });
  return {
    pin: (msgid) => askerRef.current?.pin(msgid) ?? refused,
    unpin: (msgid) => askerRef.current?.unpin(msgid) ?? refused,
  };
}
