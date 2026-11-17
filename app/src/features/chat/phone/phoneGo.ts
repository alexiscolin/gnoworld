// A phone is the full chat only: a place's address goes to its full chat (the cosmos's and an ecosystem's go home from their routes'
// loaders, routes/phoneAway.ts).
import { PHONE_QUERY } from "@gnoworld/core";
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { fullOnPhone } from "../../../fullChat.ts";
import { rememberLanding } from "../../../lib/recents.ts";
import { remembers } from "../../../phoneLanding.ts";
import { useMedia } from "../dock/useMedia.ts";

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
  // Where a phone opens next time (phoneLanding.ts): the worlds and the Earth it was in, whatever way it came.
  useEffect(() => {
    if (phone && remembers(pathname)) rememberLanding(pathname);
  }, [phone, pathname]);
  return to !== undefined;
}
