// A phone has no space to show a cosmos view, an ecosystem's page or a home in: it opens into a chat, the last world's it was in, else the
// Earth's (phoneLanding.ts), before anything is read. The landing's code is a chunk a computer never asks (its first screen pays for the
// phone's test alone).
import { PHONE_QUERY } from "@gnoworld/core";
import { useEffect } from "react";
import { redirect, useNavigate } from "react-router";
import { useMedia } from "../features/chat/useMedia.ts";

const landingOf = async (home: string) => (await import("./phoneLand.ts")).landingOf(home);

/** The redirect of a phone at the universe whose home is `home`, to its landing chat, once its code has come; none, at once, on a computer
 * (a page rendered with no window never asks). */
export const phoneAway = (home: string): Promise<Response> | undefined =>
  typeof matchMedia === "function" && matchMedia(PHONE_QUERY).matches ? landingOf(home).then(redirect) : undefined;

/** The same, for a page that was pre-rendered: it hydrates without its client loader running, so a phone goes on from an effect (by a
 * replace, as the loader's redirect does). True while it goes, so the page draws nothing in between. */
export function usePhoneAway(home: string): boolean {
  const phone = useMedia(PHONE_QUERY);
  const navigate = useNavigate();
  useEffect(() => {
    if (phone)
      landingOf(home)
        .then((path) => navigate(path, { replace: true }))
        .catch(reportError);
  }, [phone, home, navigate]);
  return phone;
}
