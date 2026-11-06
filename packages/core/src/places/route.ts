// The site's routes to a world's page and a realm's view, in a module of their own: the scene's chunks read them with nothing of the
// places' list.
import { REALM_PREFIX } from "../chain/realm.ts";

/** A world's page in the default universe, `/w/<slug>`: one spelling (F4475). */
export const worldRoute = (slug: string): string => `/w/${slug}`;

/** A realm's view on this site: `/r/<path>`, under `base` (`/net/<universe>`) off the default universe; one spelling (F4474). */
export const realmRoute = (realm: string, base = ""): string => `${base}/r/${realm.slice(REALM_PREFIX.length)}`;
