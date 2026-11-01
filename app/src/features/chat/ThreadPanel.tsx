// The panel of a thread open beside a room (4d's threads), a lazy chunk of its own like the thread's body: a page that opens no
// thread never loads it (ADR-0001 §12), nor the core's reading of a thread's root.
import { foldEdits, threadsOf, type Line } from "@gnoworld/core";
import { lazy, Suspense, useEffectEvent, useLayoutEffect, useState } from "react";
import { renewComposer } from "./composerChunk.ts";
import { Failing } from "./Failing.tsx";
import { Standing } from "./Standing.tsx";
import type { Shown } from "./shown.tsx";
import { focusLine, type Open, type Page, type Typed } from "./threadShared.ts";

const load = async () => ({ default: (await import("./ThreadBody.tsx")).ThreadBody });
// A lazy component keeps its failure for good: a chunk that could not be fetched, this one's or the composer's, is
// made anew (Failing).
let Thread = lazy(load);

/** The msgid of the root of the thread the line `id` is in, or its own when it is in none, as the room shows its lines.*/
export function rootOf(lines: readonly Line[], id: string): string {
  const { shown, folded } = foldEdits(lines);
  const resolve = (to: string) => folded.get(to) ?? to;
  const line = resolve(id);
  return threadsOf(shown, resolve).rootOf.get(line) ?? line;
}

// The panel of the thread `open`, with the composer that tags each line with its root: a guest's word, or the field.
export function ThreadPanel({
  open,
  shown,
  state,
  session,
  rooms,
  acts,
  close,
  typed,
}: Page & { open: Open; shown: Shown; close: () => void; typed: Typed }) {
  const members = state?.members ?? [];
  const root = rootOf(state?.lines ?? [], open.from);
  const slot = `${session.kind === "in" ? session.address : ""} ${open.from}`;
  // The field takes the focus only if the reader was an account as the panel opened: a login later takes none (CR4).
  const [focus] = useState(session.kind === "in");
  // A room switch takes the panel away with the focus in it: it goes back to the list, as a close gives it back (CR5).
  const places = useEffectEvent(() => [open.from, root]);
  useLayoutEffect(
    () => () => {
      if (document.activeElement?.closest("aside[aria-label='Thread']"))
        requestAnimationFrame(() => {
          focusLine(places());
        });
    },
    [],
  );
  return (
    <Failing
      fallback={<Standing word="Could not open the thread." close={close} />}
      renew={() => {
        Thread = lazy(load);
        renewComposer();
      }}
    >
      <Suspense fallback={<Standing word="Opening the thread…" close={close} />}>
        <Thread
          root={root}
          lines={state?.lines ?? []}
          members={members}
          me={session.kind === "in" ? session.address : undefined}
          onClose={close}
          writer={{
            session,
            room: shown.writer.room,
            label: "this thread",
            rooms,
            members,
            onSay: (composed) => acts.onSay(composed, { reply: root }),
            slow: acts.slow,
            focus,
            keeps: false,
            draft: typed.get(slot),
            onDraft: (text) => {
              if (text === "") typed.delete(slot);
              else typed.set(slot, text);
            },
          }}
        />
      </Suspense>
    </Failing>
  );
}
