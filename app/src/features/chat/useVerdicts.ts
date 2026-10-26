// The shown room's verdicts, which a link's player waits on (slice 4's 4g): its stream's and the server's, which the
// asker (askVerdicts.ts) follows and asks. A reader who saves data is shown no player, so follows and asks nothing
// (F879).
import type { Line } from "@gnoworld/core";
import { useEffect, useRef } from "react";
import { pageVerdictsApi } from "../../lib/api/verdicts.ts";
import { pageVerdicts } from "../../lib/stream/verdicts.ts";
import type { createAppStore } from "../../store/index.ts";
import { verdictAsker } from "./askVerdicts.ts";
import { savesData } from "./embeds.ts";

type Store = ReturnType<typeof createAppStore>;

export function useVerdicts(store: Store, current: string | undefined, lines: readonly Line[] | undefined): void {
  // The asker, made once the page runs, as the panel's link is; none for a reader who saves data (F879).
  const askerRef = useRef<ReturnType<typeof verdictAsker>>(undefined);
  useEffect(() => {
    if (savesData()) return;
    const api = pageVerdictsApi();
    const asker = verdictAsker({
      verdicts: (room, ids) => api.verdicts(room, ids),
      judged: (event) => {
        store.getState().verdictActions.judged(event);
      },
      held: (room) => store.getState().verdicts[room],
      follow: (room, on) => pageVerdicts([room], on),
    });
    askerRef.current = asker;
    return asker.stop;
  }, [store]);
  useEffect(() => {
    askerRef.current?.show(current, lines);
  }, [current, lines]);
}
