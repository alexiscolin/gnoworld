// The chords that open the chat's search (slice 13, C; D13924): Ctrl or ⌘ with Shift and F, anywhere in the chat; a bare slash, when the full chat
// covers the page and the focus is in no field. ⌘F stays the browser's own find, and a docked chat leaves the slash to the palette (search/chord.ts).
import { typedIn } from "@gnoworld/ui";

type Keys = Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">;

const slash = (event: Keys & { target?: EventTarget | null }, full: boolean) =>
  full && !event.metaKey && !event.ctrlKey && !event.altKey && !typedIn(event.target ?? null);
const chord = (event: Keys) =>
  event.key.toLowerCase() === "f" && (event.metaKey || event.ctrlKey) && event.shiftKey && !event.altKey;

export function opensChatSearch(event: Keys & { target?: EventTarget | null }, full: boolean): boolean {
  return event.key === "/" ? slash(event, full) : chord(event);
}
