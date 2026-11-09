// The palette's keys, read at its root: ⌘C copies the chosen place's link, and in the field the arrows choose, Enter goes, Shift+Enter
// opens the chat, Escape closes (the search field's own Escape would only clear it first).
import type { KeyboardEvent } from "react";
import type { SearchItem } from "./types.ts";

const composing = (event: KeyboardEvent) =>
  event.nativeEvent.isComposing || Reflect.get(event.nativeEvent, "keyCode") === 229;

const copies = (event: KeyboardEvent) => (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c";

// A copy of a selection in the field is the field's.
const selecting = (target: EventTarget) =>
  target instanceof HTMLInputElement && target.selectionStart !== target.selectionEnd;

const STEPS: Readonly<Record<string, number>> = { ArrowDown: 1, ArrowUp: -1 };

interface Keyed {
  chosen: SearchItem | undefined;
  count: number;
  active: number;
  choose: (at: number) => void;
  go: (item: SearchItem) => void;
  chat: (item: SearchItem) => void;
  copy: (item: SearchItem) => void;
  close: () => void;
}

// The keys of the field, with a place chosen.
function inField(event: KeyboardEvent, { count, active, choose, go, chat }: Keyed, item: SearchItem): void {
  const step = STEPS[event.key];
  if (step !== undefined) {
    event.preventDefault();
    choose((active + step + count) % count);
  } else if (event.key === "Enter") {
    event.preventDefault();
    (event.shiftKey ? chat : go)(item);
  }
}

export function onPaletteKey(event: KeyboardEvent, keyed: Keyed): void {
  const { chosen, copy, close } = keyed;
  if (event.key === "Escape" && event.target instanceof HTMLInputElement) {
    event.preventDefault();
    close();
  } else if (chosen === undefined) {
    return;
  } else if (copies(event)) {
    if (selecting(event.target)) return;
    event.preventDefault();
    copy(chosen);
  } else if (event.target instanceof HTMLInputElement && !composing(event)) {
    inField(event, keyed, chosen);
  }
}
