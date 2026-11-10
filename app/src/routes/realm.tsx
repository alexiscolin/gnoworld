// A realm's view: /r/<path> in the default universe, /net/<id>/r/<path> in another. A client route with no page written
// ahead (docs/plans/slice-5-part-2.md §1): the static host's fallback serves it under the catch-all's policy, and the
// browser's loader answers the 404 for a path that is no realm's. The page is read from the chain inside the view.
import { labelName, worldIdOf } from "@gnoworld/core";
import { data, useLoaderData, useLocation, type MetaArgs } from "react-router";
import { Arrival } from "../features/passport/Later.tsx";
import { PlaceError } from "../features/errors/index.ts";
import { PlaceFrame } from "./placeFrame.tsx";
import { RealmPage } from "./realmPage.tsx";
import { realmMeta } from "../meta.ts";
import { site } from "../places.ts";
import { realmAt } from "../realmAt.ts";

export function clientLoader({ request }: { request: Request }) {
  const found = realmAt(new URL(request.url).pathname);
  if (found === undefined) throw data(null, { status: 404 });
  return found;
}

export function meta({ loaderData }: MetaArgs<typeof clientLoader>) {
  return realmMeta(loaderData?.realm);
}

export default function Realm() {
  const found = useLoaderData<typeof clientLoader>();
  const world = worldIdOf(found.realm);
  const { pathname } = useLocation();
  return (
    <>
      <RealmPage {...found} />
      <Arrival universe={site.universeAt(pathname).id} world={world} name={labelName(world) ?? world} path={pathname} />
    </>
  );
}

export function ErrorBoundary() {
  // Inside the plate, as any page's content is: never loose at the screen's corner (D535).
  return <PlaceFrame label="Realm" plate={<PlaceError what="realm" />} />;
}
