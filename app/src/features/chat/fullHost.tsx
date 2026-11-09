// The full chat, one for the whole site (Alexis, 2026-11-07: "propre, bonne archi"): a page opened full says which chat it holds
// (PlaceChat), and the shell draws that one chat over everything (FullChatHost). A move from one place to another changes the chat's
// world and keeps its rooms, its link and its history; it never makes the chat again.
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { Heard } from "../../lib/heard.ts";
import { Chat, type ChatProps } from "./Chat.tsx";
import { LOADING } from "./Loading.tsx";
import { useChatAlone } from "./full.ts";

let held: ChatProps | undefined;
const heard = new Heard();
const hold = (next: ChatProps | undefined) => {
  held = next;
  heard.tell();
};

// The pages that hold the full chat now: the one leaving and the one coming are told in the same commit.
let holders = 0;

// A page's word in the full chat: its chat is the shell's. It draws nothing. The chat is let go once no page holds it after the commit
// that moved from one page to the next, and a next page whose chat cannot be drawn yet keeps the one before till it can: the full chat
// never gives way to space between two places (Alexis, 2026-11-08).
function FullChat({ chat }: { chat: ChatProps | undefined }) {
  useEffect(() => {
    holders += 1;
    return () => {
      holders -= 1;
      queueMicrotask(() => {
        if (holders === 0) hold(undefined);
      });
    };
  }, []);
  useEffect(() => {
    if (chat !== undefined) hold(chat);
  }, [chat]);
  return null;
}

/** A place's page and its chat: the page with its chat docked in it, or, asked full in the address, the shell's one chat alone (no space,
 * no plate). `chat` is none while it cannot be drawn yet. */
export function PlaceChat({ chat, page }: { chat: ChatProps | undefined; page: (dock: ReactNode) => ReactNode }) {
  return useChatAlone() ? <FullChat chat={chat} /> : page(chat === undefined ? LOADING : <Chat {...chat} />);
}

/** The shell's one full chat, the one the page in view holds. */
export function FullChatHost() {
  const chat = useSyncExternalStore(
    heard.subscribe,
    () => held,
    () => undefined,
  );
  return useChatAlone() && chat !== undefined ? <Chat {...chat} /> : null;
}
