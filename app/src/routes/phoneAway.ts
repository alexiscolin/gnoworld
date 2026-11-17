// A phone has no space to show a cosmos view, an ecosystem's page or a home in: it opens into a chat, the last world's it was in, else the
// Earth's (phoneLanding.ts), before anything is read. The landing's code is a chunk a computer never asks (its first screen pays for the
// phone's test alone).
import { PHONE_QUERY } from "@gnoworld/core";
import { redirect } from "react-router";

/** The redirect of a phone at the universe whose home is `home`, to its landing chat, once its code has come; none, at once, on a computer
 * (a page rendered with no window never asks). */
export const phoneAway = (home: string): Promise<Response> | undefined =>
  typeof matchMedia === "function" && matchMedia(PHONE_QUERY).matches
    ? import("./phoneLand.ts").then(({ landingOf }) => redirect(landingOf(home)))
    : undefined;
