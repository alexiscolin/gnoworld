// The cosmos's own addresses (D344): the home's page shows the whole cosmos far out at `/universe` and a namespace's system at
// `/s/<namespace>`, the Earth's system at `/s/gnoland` like any other; the home's own path is the Earth's first screen (D501).

/** What the cosmos's addresses say (D344): the whole cosmos far out, or a system, the Earth's with none named. */
export type CosmosAt = { readonly view: "universe" } | { readonly view: "system"; readonly system: string | undefined };

const UNIVERSE_PATH = "/universe";
const SYSTEM_PATH = /^\/s\/([^/]+)$/;

/** A path as the data spells it: a trailing slash is no part of the address, `/` aside. */
export const trimmed = (pathname: string): string => (pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname);

/** The cosmos's own addresses, which are the home's page: `/universe` the whole cosmos, `/s/<namespace>` that namespace's system. */
export function cosmosAt(pathname: string): CosmosAt | undefined {
  const here = trimmed(pathname);
  if (here === UNIVERSE_PATH) return { view: "universe" };
  const named = SYSTEM_PATH.exec(here)?.[1];
  if (named === undefined) return undefined;
  try {
    return { view: "system", system: decodeURIComponent(named) };
  } catch {
    return undefined;
  }
}

/** The namespaces whose worlds orbit the Earth, in the home's system (D401): their system is the home's, at the home's own path. */
export const HOME_NAMESPACES: readonly string[] = ["gov", "gnoland", "sys", "demo"];

/** Whether `system` is the home's: none named, or a namespace that orbits the Earth. */
export const isHome = (system: string | undefined): boolean => system === undefined || HOME_NAMESPACES.includes(system);

/** The id the Earth's system goes by in an address and as a place (D501): its own page, `/s/gnoland`, as any system's. */
export const HOME_SYSTEM = "gnoland";

/** The address of a system of the cosmos, `/s/<namespace>`: the Earth's at `/s/gnoland`, whichever of its namespaces is named. */
export const systemPath = (system: string | undefined): string =>
  `/s/${encodeURIComponent(system === undefined || isHome(system) ? HOME_SYSTEM : system)}`;

const REALM_PATH = /^\/r\/([^/]+)\//;

/** The system round the page at `pathname` (D383): a realm's namespace, a system's own, none (the Earth's) anywhere else. The views' bar's
 * System goes there. */
export function systemOfPage(pathname: string): string | undefined {
  const at = cosmosAt(pathname);
  if (at?.view === "system") return at.system === "" ? undefined : at.system;
  return REALM_PATH.exec(`${pathname}/`)?.[1];
}

/** The request the cosmos's loader reads: the cosmos's own addresses are the home's page, whatever they name. */
export function homeOf(request: Request): Request {
  const url = new URL(request.url);
  if (cosmosAt(url.pathname) === undefined) return request;
  url.pathname = "/";
  return new Request(url);
}
