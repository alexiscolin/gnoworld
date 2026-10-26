// The shown room's verdicts, which a link's player waits on (slice 4's 4g): the stream's, for the room in view; and
// the server's (askVerdicts.ts) for the lines in view the stream did not give.
import type { Line } from "@gnoworld/core";
import { useEffect, useRef } from "react";
import { pageVerdictsApi } from "../../lib/api/verdicts.ts";
import { pageVerdicts } from "../../lib/stream/verdicts.ts";
import type { createAppStore } from "../../store/index.ts";
import { verdictAsker } from "./askVerdicts.ts";

type Store = ReturnType<typeof createAppStore>;

export function useVerdicts(store: Store, current: string | undefined, lines: readonly Line[] | undefined): void {
  // When the shown room's stream opened: the lines said before it are the server's to answer (F884).
  const sinceRef = useRef(0);
  useEffect(() => {
    if (current === undefined) return;
    sinceRef.current = Date.now();
    return pageVerdicts([current], store.getState().verdictActions.judged);
  }, [store, current]);
  // The asker, made once the page runs, as the panel's link is.
  const askerRef = useRef<ReturnType<typeof verdictAsker>>(undefined);
  useEffect(() => {
    const api = pageVerdictsApi();
    const asker = verdictAsker({
      verdicts: (room, ids) => api.verdicts(room, ids),
      judged: (event) => {
        store.getState().verdictActions.judged(event);
      },
    });
    askerRef.current = asker;
    return asker.stop;
  }, [store]);
  useEffect(() => {
    if (current === undefined || lines === undefined) return;
    askerRef.current?.ask(current, { lines, held: store.getState().verdicts[current], since: sinceRef.current });
  }, [store, current, lines]);
}
