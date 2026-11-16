// A phone is the full chat only: a place's address goes to its full chat, the cosmos's to home, and the chat's back never lands on a
// page that sends it straight on again.
import { PHONE_QUERY } from "@gnoworld/core";
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { cosmosAt } from "../../cosmosAt.ts";
import { fullOnPhone } from "../../fullChat.ts";
import { site } from "../../places.ts";
import { useMedia } from "./useMedia.ts";

const ECOSYSTEM_PAGE = /^(?:\/net\/[^/]+)?\/e\//;

/** Where a phone leaves the address `at` for, a phone being the full chat only: a place goes to its full chat (what the address asked of
 * the room or the person kept), the cosmos's addresses and an ecosystem's to the universe's `home`; none anywhere else, on a computer or
 * in the full chat already. */
export function phoneGoes(
  phone: boolean,
  at: { readonly pathname: string; readonly search: string; readonly hash: string },
  home: string,
): string | undefined {
  if (!phone) return undefined;
  if (cosmosAt(at.pathname) !== undefined || ECOSYSTEM_PAGE.test(at.pathname)) return home;
  return fullOnPhone(at);
}

/** Takes a phone off an address it has no page for (fullChat.ts's `phoneGoes`), by a replace; true while it goes, so the page draws
 * nothing in between. */
export function usePhoneGo(): boolean {
  const phone = useMedia(PHONE_QUERY);
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();
  const to = phoneGoes(phone, { pathname, search, hash }, site.universeAt(pathname).home.path);
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
