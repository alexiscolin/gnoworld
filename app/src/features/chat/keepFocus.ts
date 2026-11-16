import { PHONE_QUERY } from "@gnoworld/core";
import type { SyntheticEvent } from "react";
import { useMedia } from "./useMedia.ts";

/** A press on a button leaves the focus where it is: a phone folds the shell header while a chat field has it (ChatScreen.module.css), and a
 * blur at the press would move the button from under the finger before the click. Also keeps the on-screen keyboard up. */
function keepFocus(event: SyntheticEvent): void {
  if (event.target instanceof Element && event.target.closest("button") !== null) event.preventDefault();
}

/** The handlers that keep it, on a phone alone: a computer's press moves the focus as it always did. */
export function useKeepFocus() {
  const phone = useMedia(PHONE_QUERY);
  return phone ? { onPointerDown: keepFocus, onMouseDown: keepFocus } : {};
}
