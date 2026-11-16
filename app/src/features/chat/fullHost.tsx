// The full chat, one for the whole site: a page opened full says which chat it holds
// (PlaceChat), and the shell draws that one chat over everything (FullChatHost). A move from one place to another changes the chat's
// world and keeps its rooms, its link and its history; it never makes the chat again.
import {
  useEffect,
  useInsertionEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Heard } from "../../lib/heard.ts";
import { Chat, type ChatProps } from "./Chat.tsx";
import { FullLoading } from "./FullLoading.tsx";
import { DockCover } from "./DockCover.tsx";
import { asksFull, useChatAlone } from "./full.ts";
import { usePhoneGo } from "./phoneGo.ts";
import { PlacePageProvider } from "./placePage.ts";
import { keyOf, leaveDocked, leaveFull, leaveRoom, scrollsOf, restoreScrolls } from "./stillScreen.ts";

// The chat held and the page of its place (placePage.ts) as one snapshot: a chat never shows another place's plate, and a docked one none.
interface Held {
  readonly chat: ChatProps;
  readonly plate: ReactNode;
}
let held: Held | undefined;
const heard = new Heard();
const hold = (next: Held | undefined) => {
  if (next !== undefined && held !== undefined && keyOf(held.chat.place) !== keyOf(next.chat.place))
    leaveRoom(keyOf(held.chat.place));
  held = next;
  heard.tell();
};

/** Whether a chat stands from the page before: a page shows its dock at once, never waiting for the door to space its first chat waits for. */
export const chatHeld = (): boolean => held !== undefined;

// The pages that hold a chat now, docked or full: the one leaving and the one coming are told in the same commit.
let holders = 0;

// A page's hold on the shell's one chat. The chat is let go once no page holds it after the commit that moved from one page to the next,
// so a move never makes it again.
function useHolding() {
  useEffect(() => {
    holders += 1;
    return () => {
      holders -= 1;
      queueMicrotask(() => {
        if (holders === 0) hold(undefined);
      });
    };
  }, []);
}

// A page's word in the full chat: its chat is the shell's. It draws nothing. A next page whose chat cannot be drawn yet keeps the one
// before till it can: the full chat never gives way to space between two places.
// A place whose chat failed lets the old one go, so the failure shows in its place.
function FullChat({ chat, plate, failed }: { chat: ChatProps | undefined; plate: ReactNode; failed: boolean }) {
  useEffect(() => {
    if (chat !== undefined) hold({ chat, plate });
    else if (failed) hold(undefined);
    else heard.tell();
  }, [chat, plate, failed]);
  return null;
}

// The element the docked chat is drawn in, one for the whole site: each page's dock takes it in, so the chat stands once across the
// pages that dock it (a realm, a hub, the Earth) and a move changes its world in place.
let seat: HTMLElement | undefined;
const seatOf = (): HTMLElement => {
  if (seat === undefined) {
    seat = document.createElement("div");
    seat.style.display = "contents";
    seat.setAttribute("data-chat-seat", "");
  }
  return seat;
};

// The seat taken to `place`: what stood focused in it keeps its focus, which a node moved loses.
function putSeat(place: Element): void {
  const chair = seatOf();
  if (chair.parentElement === place) return;
  const focused = chair.contains(document.activeElement) ? document.activeElement : null;
  place.append(chair);
  if (focused instanceof HTMLElement) focused.focus({ preventScroll: true });
}

let stood: ReturnType<typeof scrollsOf> = [];

// A page's dock: the shell's chat is drawn in it once the page has one, or as soon as the chat stands from the page before (inert while this
// page's own cannot be drawn yet), never a skeleton in the place of a chat that is there.
function DockSlot({ chat }: { chat: ChatProps | undefined }) {
  const slotRef = useRef<HTMLDivElement>(null);
  // A dock whose chat stands from the page before has no skeleton: the chat is there.
  const [fresh] = useState(held === undefined);
  const ready = chat !== undefined;
  const takes = ready || held !== undefined;
  useLayoutEffect(() => {
    const box = slotRef.current;
    if (!takes || box === null) return;
    const chair = seatOf();
    chair.toggleAttribute("data-stood", held !== undefined);
    putSeat(box);
    restoreScrolls(chair, stood);
    return () => {
      stood = scrollsOf(chair);
    };
  }, [takes]);
  useLayoutEffect(() => {
    if (!takes) return;
    const chair = seatOf();
    chair.inert = !ready;
    if (ready) chair.removeAttribute("aria-busy");
    else chair.setAttribute("aria-busy", "true");
  }, [takes, ready]);
  useEffect(() => {
    if (chat !== undefined) hold({ chat, plate: null });
  }, [chat]);
  // Heals itself: a render that finds the chat let go or its seat out of this box (module state reset by a hot reload, a seat left in the
  // body) holds it and takes the seat again.
  useLayoutEffect(() => {
    const box = slotRef.current;
    if (box === null || !takes) return;
    if (held === undefined && chat !== undefined) hold({ chat, plate: null });
    putSeat(box);
  });
  return (
    <div ref={slotRef} style={{ display: "contents" }}>
      {fresh ? <DockCover waiting={!ready} /> : null}
    </div>
  );
}

/** A place's page and its chat: the page with its chat docked in it, or, asked full in the address, the shell's one chat alone (no space,
 * no plate). `chat` is none while it cannot be drawn yet. */
export function PlaceChat({
  chat,
  page,
  plate,
  failed,
}: {
  chat: ChatProps | undefined;
  page: (dock: ReactNode) => ReactNode;
  /** The page's own plate (lazy), for the phone's "Its page" sheet of the chat alone (placePage.ts); none for a place with no page. */
  plate?: ReactNode;
  /** What the chat alone (a phone's) draws in the chat's place when the place's chat cannot be made, with its way to try again. */
  failed?: ReactNode;
}) {
  useHolding();
  const going = usePhoneGo();
  const alone = useChatAlone();
  if (going) return null;
  if (!alone) return page(<DockSlot chat={chat} />);
  return (
    <>
      <FullChat chat={chat} plate={plate} failed={failed !== undefined} />
      {chat !== undefined ? null : failed !== undefined ? (
        <div data-chat-failed="">{failed}</div>
      ) : chatHeld() ? null : (
        <Pending />
      )}
    </>
  );
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
function Pending() {
  return isOpening() ? null : <Shape />;
}

/** The shell's skeleton over the full chat of a page opened full from its address; the chat itself is the docked one's (DockedChatHost). */
export function FullChatHost() {
  return useChatAlone() && isOpening() ? <Shape /> : null;
}

/** The shell's one chat, drawn once in its seat: in the dock of the page in view, or, the address asking it full, in the window's own place,
 * the same screen with its columns, rooms, lines and draft (the move is the screen's `full`, fullMove.ts). */
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
