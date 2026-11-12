// Whether the chat is full bleed over its page rather than docked beside the scene: it lives in the address (?chat=full),
// so a reload and a shared link keep it. Where there is no dock (a narrow window) the chat is always full, the address
// or not. Every link that changes the room carries the choice on.
import { createContext, createElement, use, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { asksFull, FULL } from "../../fullChat.ts";
import { FullChatLinks } from "../../routerLink.tsx";

export { asksFull };
/** The same search with the full chat asked for, or not. */
export function withFull(params: URLSearchParams, full: boolean): URLSearchParams {
  const next = new URLSearchParams(params);
  if (full) next.set(FULL, "full");
  else next.delete(FULL);
  return next;
}

const never = () => () => undefined;

/** Whether the page draws its chat alone, full: the address asks it (?chat=full), and space and the plate stay out (Alexis,
 * 2026-11-07: "on ne sort jamais de là"). The build wrote the page from an address with no search, so the first draw of a page
 * hydrated from it says no, as the file does, and the address's word comes right after (React's error #418 otherwise). */
export function useChatAlone(): boolean {
  const asked = asksFull(useSearchParams()[0]);
  return useSyncExternalStore(
    never,
    () => asked,
    () => false,
  );
}

const FullContext = createContext(false);
/** What the chat holds knows its size, and its links keep the full chat (routerLink.tsx). */
export const FullProvider = ({ value, children }: { value: boolean; children: ReactNode }) =>
  createElement(FullContext.Provider, { value }, createElement(FullChatLinks, { full: value }, children));
/** What the screen draws, which the rooms' links keep. */
export const useFull = (): boolean => use(FullContext);

/** The size of the header's controls: the site's own in the full chat, the dock's small ones docked. */
export const useControlSize = (): "m" | "s" => (useFull() ? "m" : "s");

/** Marks the root while the full chat covers the page, so the scene behind stops drawing (space/motion.ts's `coveredByChat`). */
export function useFullMark(full: boolean): void {
  useEffect(() => {
    if (!full) return;
    const root = document.documentElement;
    root.dataset["chat"] = "full";
    return () => {
      delete root.dataset["chat"];
    };
  }, [full]);
}
