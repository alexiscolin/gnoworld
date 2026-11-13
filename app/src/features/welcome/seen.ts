// Whether this device has met the welcome card: it is shown once, at a first visit, and a device that keeps nothing shows it never,
// not at each visit, so a read that fails is a "seen" (lib/flags.ts reads a failure as none).
import { flagAbsent, writeFlag } from "../../lib/flags.ts";

const KEY = "gnoworld:welcomed";
const KEPT = "1";

/** Whether the device says, plainly, that the card was never used. */
export const unseen = (): boolean => flagAbsent(KEY);

/** A button or the close was used: never again. */
export const seen = (): void => {
  writeFlag(KEY, KEPT);
};
