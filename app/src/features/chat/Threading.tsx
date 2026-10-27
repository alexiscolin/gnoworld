// The thread open beside a room (slice 4's 4d threads, apart from Loaded.tsx): the root and the line that opened it,
// kept for the conversation in view alone, and the panel, a lazy chunk like the composer and the lines' view: a page
// that opens no thread never loads its code (ADR-0001 §12).
import { foldEdits, threadsOf, type Line } from "@gnoworld/core";
import { IconButton, Sidebar } from "@gnoworld/ui";
import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import type { AppState } from "../../store/index.ts";
import type { RoomActs } from "./roomActs.ts";
import type { Shown } from "./shown.tsx";
import styles from "./Thread.module.css";
import { Writer } from "./Writer.tsx";

const load = async () => ({ default: (await import("./Thread.tsx")).Thread });
// A lazy component keeps its failure for good: a chunk that could not be fetched is made anew (Failing).
let Thread = lazy(load);

// The panel's place while its code comes, or when it could not: a word and Close, which a narrow room needs, as the
// room is hidden while a thread is open (CR3).
function Standing({ word, close }: { word: string; close: () => void }) {
  const boxRef = useRef<HTMLElement>(null);
  useEffect(() => {
    boxRef.current?.querySelector("button")?.focus();
  }, []);
  return (
    <aside ref={boxRef} aria-label="Thread" className={styles["panel"]}>
      <Sidebar side="end" space="2xs">
        <p role="status">{word}</p>
        <IconButton icon="close" label="Close the thread" size="s" emphasis="plain" onClick={close} />
      </Sidebar>
    </aside>
  );
}

// The panel's failure alone, never the page's: its code could not be fetched.
class Failing extends Component<{ close: () => void; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch() {
    Thread = lazy(load);
  }
  override render() {
    return this.state.failed ? (
      <Standing word="Could not open the thread." close={this.props.close} />
    ) : (
      this.props.children
    );
  }
}

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

// The words typed in each thread's field and not sent, by account and root: the page's memory, kept on no device, so a
// close, a room or another thread keeps them (CR1).
type Typed = Map<string, string>;

// The panel of the thread `open`, with the composer that tags each line with its root: a guest's word, or the field.
function Panel({
  open,
  shown,
  state,
  session,
  rooms,
  acts,
  close,
  typed,
}: Omit<Page, "people"> & { open: Open; shown: Shown; close: () => void; typed: Typed }) {
  const members = state?.members ?? [];
  const root = rootOf(state?.lines ?? [], open.from);
  const slot = `${session.kind === "in" ? session.address : ""} ${root}`;
  // The field takes the focus only if the reader was an account as the panel opened: a login later takes none (CR4).
  const [focus] = useState(session.kind === "in");
  return (
    <Failing close={close}>
      <Suspense fallback={<Standing word="Opening the thread…" close={close} />}>
        <Thread
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
              focus={focus}
              keeps={false}
              draft={typed.get(slot)}
              onDraft={(text) => {
                if (text === "") typed.delete(slot);
                else typed.set(slot, text);
              }}
            />
          }
        />
      </Suspense>
    </Failing>
  );
}

/** What a room's thread adds to its page: how a line opens one, and what stands beside the lines: the panel while one is
 * open, else who is here (none beside a direct message's). Another conversation in view closes it. */
export function useThreads(page: Page) {
  const { shown, state, people } = page;
  const [open, setOpen] = useState<Open>();
  const [typed] = useState<Typed>(() => new Map());
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
    aside:
      open === undefined ? (
        people
      ) : (
        <Panel key={open.from} {...page} shown={shown} open={open} close={close} typed={typed} />
      ),
  };
}
