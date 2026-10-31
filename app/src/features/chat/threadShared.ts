// What a room's thread panel and the page's hook (Threading.tsx) share, apart from them so the panel's chunk and the hook that
// asks it import each other by neither.
import type { AppState } from "../../store/index.ts";
import type { RoomActs } from "./roomActs.ts";
import type { Shown } from "./shown.tsx";

// A thread open: its conversation and the line that opened it, which the focus goes back to. Its root is read from
// the lines each time they change: a chain grows while its panel is open (CR9).
export interface Open {
  key: string;
  from: string;
}

// The focus back on the line that opened the thread, else its root, else the list's own stop, never the page.
export function focusLine(ids: readonly string[]) {
  const list = document.querySelector("ol[aria-label='Messages']");
  const items = [...(list?.children ?? [])].filter((item): item is HTMLElement => item instanceof HTMLElement);
  const found = ids.map((id) => items.find((item) => item.dataset["line"] === id)).find((item) => item !== undefined);
  (found ?? items.find((item) => item.tabIndex === 0))?.focus();
}

/** What the page gives a room's thread: the conversation in view, its room's state, the reader, the world's rooms (the
 * composer completes to them) and what the reader may do. */
export interface Page {
  shown: Shown | undefined;
  state: AppState["chat"]["rooms"][string] | undefined;
  session: AppState["login"]["session"];
  rooms: readonly string[];
  acts: RoomActs;
}

// The words typed in each thread's field and not sent, by account and the line that opened it (a root changes as its
// chain grows, R3): the page's memory, kept on no device, so a close, a room or another thread keeps them (CR1), and a
// logout clears them (R1).
export type Typed = Map<string, string>;
