// The places' list is the search palette (D355): /list keeps working, and goes to the home with the palette open. It has no place of its own.
import { Navigate, data } from "react-router";
import { RouteError } from "../features/errors/index.ts";
import { SEARCH_HASH } from "../features/search/index.ts";
import { listMeta } from "../meta.ts";
import { pageOf } from "../places.ts";

export const meta = listMeta;

// The path's case is part of the address (F376): React Router matches /LIST to this route, and the data holds nothing
// to look up, so the path itself is checked.
function onlyList({ pathname }: URL): null {
  if (pathname !== "/list" && pathname !== "/list/") throw data(null, { status: 404 });
  return null;
}
export function loader({ request }: { request: Request }) {
  return onlyList(new URL(pageOf(request).url));
}
export function clientLoader({ request }: { request: Request }) {
  return onlyList(new URL(request.url));
}

export default function List() {
  return <Navigate to={`/${SEARCH_HASH}`} replace />;
}

export function ErrorBoundary() {
  return <RouteError noun="page" />;
}
