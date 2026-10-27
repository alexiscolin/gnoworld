// The shown room's verdicts, which a link's player waits on (slice 4's 4g): its stream's and the server's, which the
// asker (askVerdicts.ts) follows and asks. A reader who saves data is shown no player, so follows and asks nothing
// (F879).
import type { Line } from "@gnoworld/core";
import { useEffect, useRef } from "react";
import { pageVerdictsApi } from "../../lib/api/verdicts.ts";
import { pageVerdicts } from "../../lib/stream/verdicts.ts";
import type { createAppStore } from "../../store/index.ts";
import { verdictAsker } from "./askVerdicts.ts";

type Store = ReturnType<typeof createAppStore>;

/** The room shown, its lines once loaded, and who reads it: an account's address, or none for a guest. */
export interface Shown {
  room: string | undefined;
  lines: readonly Line[] | undefined;
  reader: string | undefined;
  /** Whether the reader saves data, read once: then the page follows and asks nothing (F879, F893). */
  saving: boolean;
}

/** Follows and asks of the shown room's verdicts for its reader. */
export function useVerdicts(store: Store, { room, lines, reader, saving }: Shown): void {
  // The asker, made once the page runs, as the panel's link is; none for a reader who saves data (F879).
  const askerRef = useRef<ReturnType<typeof verdictAsker>>(undefined);
  useEffect(() => {
    if (saving) return;
    const api = pageVerdictsApi();
    const asker = verdictAsker({
      verdicts: api.verdicts,
      ...store.getState().verdictActions,
      held: (room) => store.getState().verdicts[room],
      follow: (room, on) => pageVerdicts([room], on),
    });
    askerRef.current = asker;
    return asker.stop;
  }, [store, saving]);
  useEffect(() => {
    askerRef.current?.show(room, lines, reader);
  }, [room, lines, reader]);
}
