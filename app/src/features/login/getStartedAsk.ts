import { detect } from "../../lib/adena/detect.ts";

/** Whether Adena is in the page now, read once. */
export const adenaHere = (): boolean => detect(Reflect.get(globalThis, "adena")).ok;
