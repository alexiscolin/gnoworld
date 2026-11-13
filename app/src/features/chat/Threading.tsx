// The thread open beside a room (slice 4's 4d threads, apart from Loaded.tsx): the root and the line that opened it,
// kept for the conversation in view alone, and the panel, a lazy chunk like the composer and the lines' view: a page
// that opens no thread never loads its code (ADR-0001 §12).
import type { Line } from "@gnoworld/core";
import { lazy, Suspense, useEffect, useState } from "react";
import { Failing } from "./Failing.tsx";
import { Standing } from "./Standing.tsx";
import { focusLine, type Open, type Page, type Typed } from "./threadShared.ts";

const load = async () => ({ default: (await import("./ThreadPanel.tsx")).ThreadPanel });
// A lazy component keeps its failure for good: a chunk that could not be fetched is made anew (Failing).
let Panel = lazy(load);

// The root is read by the panel's code, loaded as the panel is open; failing that, the line that opened it alone.
function focusAfterClose(from: string, lines: readonly Line[]) {
  import("./ThreadPanel.tsx").then(
    ({ rootOf }) => {
      focusLine([from, rootOf(lines, from)]);
    },
    () => {
      focusLine([from]);
    },
  );
}

/** What a room's thread adds to its page: how a line opens one, and the panel that takes the info panel's place while one is
 * open. Another conversation in view closes it. */
export function useThreads(page: Page) {
  const { shown, state } = page;
  const [open, setOpen] = useState<Open>();
  const [typed] = useState<Typed>(() => new Map());
  // A logout is a fresh start: the words are handed to no next account, and kept for no return of the same one (R1).
  const reader = page.session.kind;
  useEffect(() => {
    if (reader !== "in") typed.clear();
  }, [reader, typed]);
  if (open !== undefined && open.key !== shown?.key) setOpen(undefined);
  if (shown?.kind !== "room") return { view: {}, aside: undefined, close: undefined };
  const close = () => {
    const from = open?.from;
    const lines = state?.lines ?? [];
    setOpen(undefined);
    // After React drew the room again, which a narrow room hid while the panel was open. The root is read by the panel's code,
    // which is loaded as the panel is open; failing that, the line that opened it alone.
    requestAnimationFrame(() => {
      if (from === undefined) return;
      focusAfterClose(from, lines);
    });
  };
  return {
    close: open === undefined ? undefined : close,
    view: {
      onThread: (id: string) => {
        setOpen({ key: shown.key, from: id });
      },
      threaded: open !== undefined,
    },
    aside:
      open === undefined ? undefined : (
        <Failing
          key={open.from}
          fallback={<Standing word="Could not open the thread." close={close} />}
          renew={() => {
            Panel = lazy(load);
          }}
        >
          <Suspense fallback={<Standing word="Opening the thread…" close={close} busy />}>
            <Panel {...page} shown={shown} open={open} close={close} typed={typed} />
          </Suspense>
        </Failing>
      ),
  };
}
