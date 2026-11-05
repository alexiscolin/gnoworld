// The shown room's verdicts, which a link's player waits on (slice 4's 4g): its stream's and the server's, which the
// asker (askVerdicts.ts) follows and asks. A reader who saves data is shown no player, so follows and asks nothing
// (F879).
import type { Line } from "@gnoworld/core";
import { useEffect, useRef } from "react";
import { pageVerdictsApi } from "../../lib/api/verdicts.ts";
import { lazyChain } from "../../lib/stream/lazyChain.ts";
import { pageVerdicts } from "../../lib/stream/verdicts.ts";
import type { createAppStore } from "../../store/index.ts";
import { verdictAsker } from "./askVerdicts.ts";

type Linked = (text: string) => boolean;
// Outside the hook, which the React Compiler cannot lower an import() in.
const loadLinked = () => import("./linked.ts");
const loadFeed = () => import("../../lib/stream/chainFeed.ts");
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
  // What finds a player's link in a line, asked with the room's first lines: the first screen holds no Markdown's code.
  const linkedRef = useRef<Linked>(undefined);
  useEffect(() => {
    if (saving) return;
    const api = pageVerdictsApi();
    // The world's calls on chain and the Earth's count come on the same stream, into the store in batches (9g).
    const feed = lazyChain(async () => (await loadFeed()).chainFeed(store.getState().chainActions));
    const asker = verdictAsker({
      verdicts: api.verdicts,
      ...store.getState().verdictActions,
      signal: store.getState().signalActions.signaled,
      held: (room) => store.getState().verdicts[room],
      follow: (room, on) => pageVerdicts([room], { ...on, chain: feed.chain, realms: feed.realms }),
      linked: (text) => linkedRef.current?.(text) ?? false,
    });
    askerRef.current = asker;
    return () => {
      asker.stop();
      feed.stop();
    };
  }, [store, saving]);
  useEffect(() => {
    // Lines given the asker before it can read them would be counted looked at and never asked of: it follows the room alone.
    const ready = linkedRef.current !== undefined || lines === undefined || lines.length === 0;
    askerRef.current?.show(room, ready ? lines : undefined, reader);
    if (ready) return;
    let live = true;
    // A chunk that could not be fetched is asked for again as the lines change.
    void loadLinked().then(
      ({ linked }) => {
        linkedRef.current = linked;
        if (live) askerRef.current?.show(room, lines, reader);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [room, lines, reader]);
}
