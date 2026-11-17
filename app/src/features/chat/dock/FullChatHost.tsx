// The full chat, one for the whole site: a page opened full says which chat it holds
// (PlaceChat), and the shell draws that one chat over everything (FullChatHost). A move from one place to another changes the chat's
// world and keeps its rooms, its link and its history; it never makes the chat again.
import { useInsertionEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Heard } from "../../../lib/heard.ts";
import { Chat, type ChatProps } from "../Chat.tsx";
import { FullLoading } from "./FullLoading.tsx";
import { asksFull, useChatAlone } from "./fullState.ts";
import { PlacePageProvider } from "../phone/placePage.ts";
import { keyOf, leaveDocked, leaveFull, leaveRoom } from "./stillScreen.ts";

// The chat held and the page of its place (placePage.ts) as one snapshot: a chat never shows another place's plate, and a docked one none.
interface Held {
  readonly chat: ChatProps;
  readonly plate: ReactNode;
}
let held: Held | undefined;
export const heard = new Heard();
export const hold = (next: Held | undefined) => {
  if (next !== undefined && held !== undefined && keyOf(held.chat.place) !== keyOf(next.chat.place))
    leaveRoom(keyOf(held.chat.place));
  held = next;
  heard.tell();
};

/** Whether a chat stands from the page before: a page shows its dock at once, never waiting for the door to space its first chat waits for. */
export const chatHeld = (): boolean => held !== undefined;

// The element the docked chat is drawn in, one for the whole site: each page's dock takes it in, so the chat stands once across the
// pages that dock it (a realm, a hub, the Earth) and a move changes its world in place.
let seat: HTMLElement | undefined;
export const seatOf = (): HTMLElement => {
  if (seat === undefined) {
    seat = document.createElement("div");
    seat.style.display = "contents";
    seat.setAttribute("data-chat-seat", "");
  }
  return seat;
};

// The seat taken to `place`: what stood focused in it keeps its focus, which a node moved loses.
export function putSeat(place: Element): void {
  const chair = seatOf();
  if (chair.parentElement === place) return;
  const focused = chair.contains(document.activeElement) ? document.activeElement : null;
  place.append(chair);
  if (focused instanceof HTMLElement) focused.focus({ preventScroll: true });
}

// Whether the page was opened full from its address: the skeleton stands for that first draw alone, never for a chat that grows out of its dock.
// Read when first needed, never at load: the phone's address is rewritten (markFullEarly) after the imports and before the first draw.
let opening: boolean | undefined;
const isOpening = (): boolean =>
  (opening ??= typeof location !== "undefined" && asksFull(new URLSearchParams(location.search)));

// The skeleton over the full chat, from the first draw of the page till the chat has faded in under it; its state goes with it, so a next full
// chat has its own.
function Shape() {
  const [gone, setGone] = useState(false);
  const leave = () => {
    opening = false;
    setGone(true);
  };
  return gone ? null : <FullLoading onGone={leave} />;
}

// The skeleton for a chat that is being made after the first draw (a realm's room), when the page's own address did not open it.
export function Pending() {
  return isOpening() ? null : <Shape />;
}

/** The shell's skeleton over the full chat of a page opened full from its address; the chat itself is the docked one's (DockedChatHost). */
export function FullChatHost() {
  // Read at the first draw of the shell, docked or not: read when the chat is first full, a chat expanded from its dock would count as opened full.
  const opened = isOpening();
  return useChatAlone() && opened ? <Shape /> : null;
}

/** The shell's one chat, drawn once in its seat: in the dock of the page in view, or, the address asking it full, in the window's own place,
 * the same screen with its columns, rooms, lines and draft (the move is the screen's `full`, useFullMove.ts). */
export function DockedChatHost() {
  const snapshot = useSyncExternalStore(
    heard.subscribe,
    () => held,
    () => undefined,
  );
  const alone = useChatAlone();
  // The seat still in the window's own place while the address no longer asks it full: this draw gives the chat back to its page, and its screen is
  // copied first, as it stands (a render only reads; a second run finds the same).
  if (!alone && seat?.parentElement?.tagName === "BODY") leaveFull();
  // The dock's screen too, as it stands, for the full chat to grow out of: the dock keeps its look while the full chat fades in over it. No
  // seat yet, no dock to copy: a page opened full, and the server's draw, which has no document.
  if (alone && seat !== undefined && seat.parentElement?.tagName !== "BODY") leaveDocked();
  // Before the layout effects of the screen the move reads its box in.
  useInsertionEffect(() => {
    if (alone) putSeat(document.body);
  }, [alone]);
  if (snapshot === undefined) return null;
  return createPortal(
    <PlacePageProvider value={snapshot.plate}>
      <Chat {...snapshot.chat} />
    </PlacePageProvider>,
    seatOf(),
  );
}
