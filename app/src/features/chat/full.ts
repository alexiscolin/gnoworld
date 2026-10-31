// Whether the chat is full bleed over its page rather than docked beside the scene: it lives in the address (?chat=full),
// so a reload and a shared link keep it. Where there is no dock (a narrow window) the chat is always full, the address
// or not. Every link that changes the room carries the choice on.
import { createContext, use } from "react";

const FULL = "chat";

/** Whether the address asks for the full chat. */
export const asksFull = (params: URLSearchParams): boolean => params.get(FULL) === "full";

/** The same search with the full chat asked for, or not. */
export function withFull(params: URLSearchParams, full: boolean): URLSearchParams {
  const next = new URLSearchParams(params);
  if (full) next.set(FULL, "full");
  else next.delete(FULL);
  return next;
}

const FullContext = createContext(false);
export const FullProvider = FullContext.Provider;
/** What the screen draws, which the rooms' links keep. */
export const useFull = (): boolean => use(FullContext);
