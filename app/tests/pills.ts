// The top pill as the tests stand it in (`vi.mock` of src/topPill.tsx answered with this module): every message raised, in order.
import type { FlashMessage } from "@gnoworld/ui";

/** The messages raised since the test emptied the list. */
export const raised: FlashMessage[] = [];

export function raisePill(message: FlashMessage): void {
  raised.push(message);
}
