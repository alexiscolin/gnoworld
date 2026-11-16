// A phone has no space to show a cosmos view or an ecosystem's page in: the universe's home list, before anything is read.
import { PHONE_QUERY } from "@gnoworld/core";
import { redirect } from "react-router";

/** The redirect to `home` on a phone, none on a computer (a page rendered with no window never asks). */
export const phoneAway = (home: string) =>
  typeof matchMedia === "function" && matchMedia(PHONE_QUERY).matches ? redirect(home) : undefined;
