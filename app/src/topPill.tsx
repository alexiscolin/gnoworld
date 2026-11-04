// The top centre's pill (DESIGN-SYSTEM.md, Layout: "one slot: the flight panel, the expedition pill, the flash"; frames 18, 23, 93): one
// host in the shell that any part raises a message in, an arrival's "Stamped", 8b's expedition, so two pills never show at once and one
// raised before a flight outlives the route it was raised on. A new message takes the place of the last.
import { Flash, type FlashMessage } from "@gnoworld/ui";
import { useSyncExternalStore } from "react";
// The listeners' record the scene's host uses: one way to tell what a component reads.
import { Heard } from "./features/universe/heard.ts";

let shown: FlashMessage | null = null;
const hearing = new Heard();

/** Shows `message` in the pill, in place of any other. */
export function raisePill(message: FlashMessage): void {
  shown = message;
  hearing.tell();
}

/** The pill itself: in the shell, once. */
export function PillHost() {
  const message = useSyncExternalStore(
    hearing.subscribe,
    () => shown,
    () => null,
  );
  return (
    <Flash
      banner
      message={message}
      onClose={() => {
        shown = null;
        hearing.tell();
      }}
    />
  );
}
