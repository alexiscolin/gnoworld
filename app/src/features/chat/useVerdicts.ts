// The shown room's verdicts, which a link's player waits on (slice 4's 4g): the stream's, for the room in view; and
// the server's (GET /api/verdicts) for the lines in view the stream did not give, a line older than its replay
// among them, asked once each, VERDICTS_ASKED a request; a line whose request failed is asked again.
import { VERDICTS_ASKED } from "@gnoworld/schemas";
import type { Line } from "@gnoworld/core";
import { useEffect, useRef } from "react";
import { pageVerdictsApi } from "../../lib/api/verdicts.ts";
import { pageVerdicts } from "../../lib/stream/verdicts.ts";
import type { createAppStore } from "../../store/index.ts";
import { unjudged } from "./embeds.ts";

type Store = ReturnType<typeof createAppStore>;

// The server's verdicts of some lines of a room, into the store; on a failure that may pass, the lines asked again.
function ask(store: Store, room: string, { ids, asked }: { ids: readonly string[]; asked: Set<string> }): void {
  const again = () => {
    for (const id of ids) asked.delete(id);
  };
  pageVerdictsApi()
    .verdicts(room, ids)
    .then((got) => {
      if (got.ok) {
        for (const { msgid, state } of got.value.verdicts)
          store.getState().verdictActions.judged({ msgid, room, state });
      } else if (got.reason === "network" || got.reason === "unavailable") again();
    }, again);
}

export function useVerdicts(store: Store, current: string | undefined, lines: readonly Line[] | undefined): void {
  useEffect(() => {
    if (current === undefined) return;
    return pageVerdicts([current], store.getState().verdictActions.judged);
  }, [store, current]);
  const askedRef = useRef(new Map<string, Set<string>>());
  useEffect(() => {
    if (current === undefined || lines === undefined) return;
    const asked = askedRef.current.get(current) ?? new Set<string>();
    askedRef.current.set(current, asked);
    const wanted = unjudged(lines, store.getState().verdicts[current], asked);
    for (const id of wanted) asked.add(id);
    for (let start = 0; start < wanted.length; start += VERDICTS_ASKED) {
      ask(store, current, { ids: wanted.slice(start, start + VERDICTS_ASKED), asked });
    }
  }, [store, current, lines]);
}
