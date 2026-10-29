// The places of the data files, to filter by genre. One page for the site, at /list: it has no place of its own.
import { Breadcrumb } from "@gnoworld/ui";
import { data } from "react-router";
import { PlacesList } from "../features/list/index.ts";
import { PlaceError } from "../features/errors/index.ts";
import { listMeta } from "../meta.ts";
import { pageOf, site } from "../places.ts";

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

// No genre is in the data files yet (the hubs' and stations' rows carry none): each place lists with none.
const PLACES = [...site.worlds, ...site.ecosystems].map((place) => ({ ...place, genres: [] }));

export default function List() {
  return (
    <>
      <Breadcrumb label="You are here" items={[{ label: "Home", href: "/" }, { label: "Places" }]} />
      <h1>Places</h1>
      <PlacesList places={PLACES} genres={site.genres} />
    </>
  );
}

export function ErrorBoundary() {
  return <PlaceError what="page" />;
}
