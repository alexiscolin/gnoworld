// A key a field or a dialog holds is theirs (7g's flights, 7v's views): V typed in the search, or Escape in a dialog, does nothing to space.
import { typedIn } from "@gnoworld/ui";

const DIALOGS = "dialog[open], [role='dialog']";

/** Whether `event`'s key belongs to the field it was typed in, or to a dialog open on the page. */
export const keyHeld = (event: KeyboardEvent): boolean =>
  typedIn(event.target) || document.querySelector(DIALOGS) !== null;
