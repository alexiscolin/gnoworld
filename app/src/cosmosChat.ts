// Whether the chat's dock stands open over the cosmos (frame 143): the header's Chat opens and shuts it on the home, its own close and
// leaving the home shut it. The page's state alone, outside the address: the chat's own search (?room, ?full) moves under it.
import { useSyncExternalStore } from "react";

let open = false;
const told = new Set<() => void>();

/** Opens or shuts the dock over the cosmos. */
export function setCosmosChat(next: boolean): void {
  if (next === open) return;
  open = next;
  for (const tell of told) tell();
}

const subscribe = (tell: () => void) => {
  told.add(tell);
  return () => {
    told.delete(tell);
  };
};

/** Whether the dock stands open over the cosmos: never in the page the build writes. */
export const useCosmosChat = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => open,
    () => false,
  );
