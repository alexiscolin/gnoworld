// A phone has no space to show a cosmos view, an ecosystem's page or a home in: it opens into a chat, the last world's it was in, else the
// Earth's (phoneLanding.ts), before anything is read.
import { PHONE_QUERY } from "@gnoworld/core";
import { useEffect } from "react";
import { redirect, useNavigate } from "react-router";
import { useMedia } from "../features/chat/useMedia.ts";
import { landingPaths } from "../lib/recents.ts";
import { site } from "../places.ts";
import { phoneLanding } from "../phoneLanding.ts";

/** The redirect of a phone at the universe whose home is `home`, to its landing chat; none on a computer (a page rendered with no window
 * never asks). */
export const phoneAway = (home: string) =>
  typeof matchMedia === "function" && matchMedia(PHONE_QUERY).matches
    ? redirect(phoneLanding(site.universeAt(home), landingPaths()))
    : undefined;

/** The same, for a page that was pre-rendered: it hydrates without its client loader running, so a phone goes on from an effect (by a
 * replace, as the loader's redirect does). True while it goes, so the page draws nothing in between. */
export function usePhoneAway(home: string): boolean {
  const phone = useMedia(PHONE_QUERY);
  const navigate = useNavigate();
  useEffect(() => {
    if (phone)
      Promise.resolve(navigate(phoneLanding(site.universeAt(home), landingPaths()), { replace: true })).catch(
        reportError,
      );
  }, [phone, home, navigate]);
  return phone;
}
