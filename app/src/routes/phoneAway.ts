// A phone has no space to show a cosmos view, an ecosystem's page or a home in: it opens into a chat, the last world's it was in, else the
// Earth's (phoneLanding.ts), before anything is read.
import { PHONE_QUERY } from "@gnoworld/core";
import { redirect } from "react-router";
import { recentPaths } from "../lib/recents.ts";
import { site } from "../places.ts";
import { phoneLanding } from "../phoneLanding.ts";

/** The redirect of a phone at the universe whose home is `home`, to its landing chat; none on a computer (a page rendered with no window
 * never asks). */
export const phoneAway = (home: string) =>
  typeof matchMedia === "function" && matchMedia(PHONE_QUERY).matches
    ? redirect(phoneLanding(site.universeAt(home), recentPaths()))
    : undefined;
