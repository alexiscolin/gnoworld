// The thread open beside a room (slice 4's 4d threads, apart from Loaded.tsx): the root and the line that opened it,
// kept for the conversation in view alone, and the panel, a lazy chunk like the composer and the lines' view: a page
// that opens no thread never loads its code (ADR-0001 §12).
import { foldEdits, threadsOf, type Line } from "@gnoworld/core";
import { lazy, Suspense, useState, type ReactNode } from "react";
import type { AppState } from "../../store/index.ts";
import type { RoomActs } from "./roomActs.ts";
import type { Shown } from "./shown.tsx";
import { Writer } from "./Writer.tsx";

const Thread = lazy(async () => ({ default: (await import("./Thread.tsx")).Thread }));

// A thread open: its conversation and the line that opened it, which the focus goes back to. Its root is read from
// the lines each time they change: a chain grows while its panel is open (CR9).
interface Open {
  key: string;
  from: string;
}

// The msgid of the root of the thread the line `id` is in, or its own when it is in none, as the room shows its lines.
function rootOf(lines: readonly Line[], id: string): string {
  const { shown, folded } = foldEdits(lines);
  const resolve = (to: string) => folded.get(to) ?? to;
  const line = resolve(id);
  return threadsOf(shown, resolve).rootOf.get(line) ?? line;
}

// The focus back on the line that opened the thread, else its root, else the list's own stop, never the page.
function focusLine(ids: readonly string[]) {
  const list = document.querySelector("ol[aria-label='Messages']");
  const items = [...(list?.children ?? [])].filter((item): item is HTMLElement => item instanceof HTMLElement);
  const found = ids.map((id) => items.find((item) => item.dataset["line"] === id)).find((item) => item !== undefined);
  (found ?? items.find((item) => item.tabIndex === 0))?.focus();
}

/** What the page gives a room's thread: the conversation in view, its room's state, the reader, the world's rooms (the
 * composer completes to them), what the reader may do, and who is here, which the panel replaces. */
interface Page {
  shown: Shown | undefined;
  state: AppState["chat"]["rooms"][string] | undefined;
  session: AppState["login"]["session"];
  rooms: readonly string[];
  acts: RoomActs;
  people: ReactNode;
}

// The panel of the thread `open`, with the composer that tags each line with its root: a guest's word, or the field.
function Panel({
  open,
  shown,
  state,
  session,
  rooms,
  acts,
  close,
}: Omit<Page, "people"> & { open: Open; shown: Shown; close: () => void }) {
  const members = state?.members ?? [];
  const root = rootOf(state?.lines ?? [], open.from);
  return (
    <Suspense fallback={null}>
      <Thread
        key={open.from}
        root={root}
        lines={state?.lines ?? []}
        members={members}
        me={session.kind === "in" ? session.address : undefined}
        onClose={close}
        composer={
          <Writer
            session={session}
            room={shown.writer.room}
            label="this thread"
            rooms={rooms}
            members={members}
            onSay={(draft) => acts.onSay(draft, root)}
            focus
            keeps={false}
          />
        }
      />
    </Suspense>
  );
}

/** What a room's thread adds to its page: how a line opens one, and what stands beside the lines: the panel while one is
 * open, else who is here (none beside a direct message's). Another conversation in view closes it. */
export function useThreads(page: Page) {
  const { shown, state, people } = page;
  const [open, setOpen] = useState<Open>();
  if (open !== undefined && open.key !== shown?.key) setOpen(undefined);
  if (shown?.kind !== "room") return { view: {}, aside: undefined };
  const close = () => {
    const ids = open === undefined ? [] : [open.from, rootOf(state?.lines ?? [], open.from)];
    setOpen(undefined);
    // After React drew the room again, which a narrow room hid while the panel was open.
    requestAnimationFrame(() => {
      focusLine(ids);
    });
  };
  return {
    view: {
      onThread: (id: string) => {
        setOpen({ key: shown.key, from: id });
      },
      threaded: open !== undefined,
    },
    aside: open === undefined ? people : <Panel {...page} shown={shown} open={open} close={close} />,
  };
}
