// The cosmos's other views, `/universe` and `/s/<namespace>` (D344): the home's page, with no page written ahead (the static host's fallback
// serves it, as it serves a realm's view), so no server loader: the browser's reads the home's data. The address says the view
// (useCosmosAddress).
import { data, useLocation } from "react-router";
import { RouteError } from "../features/errors/index.ts";
import { cosmosAt, homeOf, isHome } from "../cosmosAt.ts";
import { worldsFile } from "../features/universe/worldsFile.ts";
import { site } from "../places.ts";

// A system is a namespace with a world in the worlds' file; one the file does not hold is no system. A file that did not come proves nothing.
export async function clientLoader({ request }: { request: Request }) {
  const universe = site.universe(homeOf(request), "cosmos");
  const at = cosmosAt(new URL(request.url).pathname);
  if (at?.view !== "system" || isHome(at.system) || !universe.isDefault) return universe;
  const file = await worldsFile();
  if (file !== undefined && !file.worlds.some(({ namespace }) => namespace === at.system))
    throw data(null, { status: 404 });
  return universe;
}

export { default, links, meta } from "./home.tsx";

export function ErrorBoundary() {
  return <RouteError noun={cosmosAt(useLocation().pathname)?.view === "system" ? "system" : "universe"} />;
}
