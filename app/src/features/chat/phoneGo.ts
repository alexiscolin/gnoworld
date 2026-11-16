// A phone is the full chat only: a place's address goes to its full chat (the cosmos's and an ecosystem's go home from their routes'
// loaders, routes/phoneAway.ts), and the chat's back never lands on a page that sends it straight on again.
import { PHONE_QUERY } from "@gnoworld/core";
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { fullOnPhone } from "../../fullChat.ts";
import { site } from "../../places.ts";
import { useMedia } from "./useMedia.ts";

/** Takes a phone off a place's address for its full chat (fullChat.ts's `fullOnPhone`), by a replace; true while it goes, so the page
 * draws nothing in between. Called by the place itself (PlaceChat.tsx), which stays mounted: the shell's chat is not made twice. */
export function usePhoneGo(): boolean {
  const phone = useMedia(PHONE_QUERY);
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();
  const to = phone ? fullOnPhone({ pathname, search, hash }) : undefined;
  useEffect(() => {
    if (to !== undefined) Promise.resolve(navigate(to, { replace: true })).catch(reportError);
  }, [to, navigate]);
  return to !== undefined;
}

/** Whether the entry before the one in view is this site's: the router writes each entry's index, the first of a tab being 0. */
export function canGoBack(state: unknown): boolean {
  return (
    typeof state === "object" && state !== null && "idx" in state && typeof state.idx === "number" && state.idx > 0
  );
}

/** The chat's back on a phone: the browser's back where the entry before is ours, else home, replacing the chat's entry. */
export function useChatBack(): () => void {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const home = site.universeAt(pathname).home.path;
  return () => {
    Promise.resolve(canGoBack(history.state) ? navigate(-1) : navigate(home, { replace: true })).catch(reportError);
  };
}
