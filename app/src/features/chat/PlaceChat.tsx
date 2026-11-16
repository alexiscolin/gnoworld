// A place's page and its chat: the page with its chat docked in it, or the shell's one chat alone. Apart from fullHost (the shell's own),
// so a page that holds no chat (the home) carries none of it.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { ChatProps } from "./Chat.tsx";
import { DockCover } from "./DockCover.tsx";
import { useChatAlone } from "./full.ts";
import { chatHeld, heard, hold, Pending, putSeat, seatOf } from "./fullHost.tsx";
import { PhoneGate } from "./PhoneGate.tsx";
import { restoreScrolls, scrollsOf } from "./stillScreen.ts";

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

let stood: ReturnType<typeof scrollsOf> = [];

// A page's dock: the shell's chat is drawn in it once the page has one, or as soon as the chat stands from the page before (inert while this
// page's own cannot be drawn yet), never a skeleton in the place of a chat that is there.
function DockSlot({ chat }: { chat: ChatProps | undefined }) {
  const slotRef = useRef<HTMLDivElement>(null);
  // A dock whose chat stands from the page before has no skeleton: the chat is there.
  const [fresh] = useState(() => !chatHeld());
  const ready = chat !== undefined;
  const takes = ready || chatHeld();
  useLayoutEffect(() => {
    const box = slotRef.current;
    if (!takes || box === null) return;
    const chair = seatOf();
    chair.toggleAttribute("data-stood", chatHeld());
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
    if (!chatHeld() && chat !== undefined) hold({ chat, plate: null });
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
export function PlaceChat(props: PlaceChatProps) {
  return (
    <PhoneGate>
      <Place {...props} />
    </PhoneGate>
  );
}

interface PlaceChatProps {
  chat: ChatProps | undefined;
  page: (dock: ReactNode) => ReactNode;
  /** The page's own plate (lazy), for the phone's "Its page" sheet of the chat alone (placePage.ts); none for a place with no page. */
  plate?: ReactNode;
  /** What the chat alone (a phone's) draws in the chat's place when the place's chat cannot be made, with its way to try again. */
  failed?: ReactNode;
}

function Place({ chat, page, plate, failed }: PlaceChatProps) {
  useHolding();
  const alone = useChatAlone();
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
