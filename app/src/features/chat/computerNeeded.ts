// Whether the way in is a computer's: a phone without Adena has no Connect Adena to offer. One answer for the composer's guest box, the
// header's note and the account menu.
import { PHONE_QUERY } from "@gnoworld/core";
import { adenaHere } from "../login/index.ts";
import { useMedia } from "./useMedia.ts";

/** Whether a phone lacks Adena. False while hydrating, as the server drew it. */
export const useComputerNeeded = (): boolean => useMedia(PHONE_QUERY) && !adenaHere();
