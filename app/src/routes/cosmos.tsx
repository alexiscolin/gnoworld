// The cosmos's other views, `/universe` and `/s/<namespace>` (D344): the home's page, with no page written ahead (the static host's fallback
// serves it, as it serves a realm's view), so no server loader: the browser's reads the home's data. The address says the view
// (useCosmosAddress).
import { homeOf } from "../cosmosAt.ts";
import { site } from "../places.ts";

export function clientLoader({ request }: { request: Request }) {
  return site.universe(homeOf(request), "cosmos");
}

export { default, ErrorBoundary, links, meta } from "./home.tsx";
