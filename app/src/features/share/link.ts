// A shared place's link (the plan's threat model): the site's origin and the page's path, nothing else: no name, no address, no token.
import { ORIGIN } from "../../meta.ts";

/** A place to share: what it is called, and its page's path on this site. */
export interface SharedPlace {
  readonly name: string;
  readonly path: string;
}

/** The place's public link: the site's origin and the page's path, exactly. */
export const linkOf = (place: SharedPlace): string => ORIGIN + place.path;
