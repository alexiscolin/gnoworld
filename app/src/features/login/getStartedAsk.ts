import { detect } from "../../lib/adena/detect.ts";

// A way to open the "Get started" dialog from elsewhere (a phone menu's row, where the header has no Connect): the header's control
// listens, and the dialog stays one.
export const GET_STARTED = "gnoworld:get-started";

export const askGetStarted = (): void => {
  window.dispatchEvent(new Event(GET_STARTED));
};

/** Whether Adena is in the page now, read once. */
export const adenaHere = (): boolean => detect(Reflect.get(globalThis, "adena")).ok;
